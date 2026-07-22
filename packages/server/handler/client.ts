/* eslint-disable no-await-in-loop */
import path from 'node:path';
import { Context } from 'cordis';
import {
    BadRequestError, ForbiddenError, Handler, ValidationError,
} from '@hydrooj/framework';
import { config } from '../config';
import { fs, Logger } from '../utils';
import { AuthHandler } from './misc';
import {
    collectPrinterTargets,
    resolvePrinterTarget,
} from './printRouting';

const logger = new Logger('handler/client');
const CLIENT_PROTOCOL_VERSION = 2;

const stringArray = (value: unknown): string[] => {
    if (Array.isArray(value)) return value.map(String);
    if (!value) return [];
    try {
        const parsed = JSON.parse(String(value));
        return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
        return [String(value)];
    }
};

const jsonArray = (value: unknown): any[] => {
    if (Array.isArray(value)) return value;
    if (!value) return [];
    try {
        const parsed = JSON.parse(String(value));
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

class ClientControlHandler extends AuthHandler {
    async get() {
        const clients = await this.ctx.db.client.find({}).sort({ createAt: 1 });
        this.response.body = { clients };
    }
}

const supports = (client, service: 'printer' | 'balloon') => (
    client.type.includes(service)
);

async function getClient(ctx: Context, id: string, service: 'printer' | 'balloon') {
    const client = await ctx.db.client.findOne({ id });
    if (!client || !supports(client, service)) throw new ForbiddenError('Client', null, 'Client not found');
    return client;
}

async function syncConfiguredClients(ctx: Context) {
    const clients = (config.clients || []).filter((client) => client.type !== 'webhook');
    const tokens = new Set<string>();
    const names = new Set<string>();
    for (const client of clients) {
        if (!/^[A-Za-z0-9_-]{16,128}$/.test(client.token)) {
            throw new Error(`Client token must be 16-128 URL-safe characters: ${client.name}`);
        }
        if (new Set(client.type).size !== client.type.length) {
            throw new Error(`Client services must not contain duplicates: ${client.name}`);
        }
        if (tokens.has(client.token)) throw new Error(`Duplicate client token in config.server.yaml: ${client.token}`);
        if (names.has(client.name)) throw new Error(`Duplicate client name in config.server.yaml: ${client.name}`);
        tokens.add(client.token);
        names.add(client.name);
    }
    const existing = await ctx.db.client.find({});
    for (const client of existing) {
        if (!tokens.has(client.id)) await ctx.db.client.removeOne({ id: client.id }, {});
    }
    for (const client of clients) {
        const current = await ctx.db.client.findOne({ id: client.token });
        if (current) {
            await ctx.db.client.updateOne({ id: client.token }, {
                $set: {
                    name: client.name,
                    type: client.type,
                    configured: true,
                },
            });
        } else {
            await ctx.db.client.insert({
                id: client.token,
                name: client.name,
                type: client.type,
                configured: true,
                createAt: Date.now(),
            } as any);
        }
    }
    logger.info(`Loaded ${clients.length} print/balloon client(s) from config.server.yaml`);
}

async function claimPrintTask(ctx: Context, client: any, preferredTargetPrinter: string) {
    const candidates = await ctx.db.code.find({ printer: '', done: 0, deleted: { $ne: 1 } }).sort({ createAt: 1 });
    if (!candidates.length) return null;
    const clientStates = new Map((await ctx.db.client.find({})).map((item: any) => [item.id, item]));
    clientStates.set(client.id, client);
    const printerTargets = collectPrinterTargets([...clientStates.values()] as any[]);
    for (const code of candidates as any[]) {
        const target = resolvePrinterTarget(
            printerTargets,
            clientStates as any,
            code.group,
            code.location,
            preferredTargetPrinter,
        );
        if (!target || target.clientId !== client.id) continue;
        let content: string;
        try {
            content = fs.readFileSync(path.resolve(process.cwd(), 'data/codes', `${code.tid}#${code._id}`)).toString('base64');
        } catch (error) {
            logger.error(`Unable to read print task ${code.tid}#${code._id}`, error);
            continue;
        }
        const receivedAt = Date.now();
        const claimed = await ctx.db.code.updateOne(
            { _id: code._id, printer: '', done: 0, deleted: { $ne: 1 } },
            {
                $set: {
                    printer: client.id,
                    receivedAt,
                    targetPrinter: target.printer,
                },
            } as any,
        );
        if (claimed) {
            return {
                ...code,
                printer: client.id,
                receivedAt,
                targetPrinter: target.printer,
                code: content,
            };
        }
    }
    return null;
}

class ClientPrintConnectHandler extends Handler {
    async post(params) {
        const client = await getClient(this.ctx, params.cid, 'printer');
        if (Number(params.protocolVersion || 0) < CLIENT_PROTOCOL_VERSION) {
            throw new BadRequestError('Printer Client v2 is required');
        }
        const ip = this.request.ip.replace('::ffff:', '');
        logger.info(`Client ${client.name}(${ip}) connected.`);
        const printers = stringArray(params.printers);
        const printersInfo = jsonArray(params.printersInfo);
        await this.ctx.db.client.updateOne(
            { id: params.cid },
            {
                $set: {
                    printers,
                    printersInfo,
                    updateAt: Date.now(),
                    ip,
                },
            } as any,
        );
        const currentClient = {
            ...client,
            printers,
            printersInfo,
            updateAt: Date.now(),
            ip,
        };
        const code = await claimPrintTask(this.ctx, currentClient, String(params.preferredTargetPrinter || ''));
        if (!code) {
            this.response.body = { code: 0 };
            return;
        }
        this.response.body = {
            doc: code,
            targetPrinter: code.targetPrinter || undefined,
        };
        await this.ctx.parallel('print/sendTask', client._id);
        logger.info(`Client ${client.name} connected, print task ${code.tid}#${code._id} sent.`);
    }
}

class ClientPrintDoneHandler extends Handler {
    async post(params) {
        const client = await getClient(this.ctx, params.cid, 'printer');
        const code = await this.ctx.db.code.findOne({ _id: params.tid });
        if (!code) throw new ValidationError('Code', null, 'Code not found');
        if (code.printer !== params.cid) throw new BadRequestError('Print task changed');
        if (code.done) {
            this.response.body = { code: 1 };
            return;
        }
        const physicalPrinter = String(params.printer || '').replace(/^"|"$/g, '');
        if ((code as any).targetPrinter && physicalPrinter !== (code as any).targetPrinter) {
            throw new BadRequestError('Printer', null, 'Physical printer does not match the assigned route');
        }
        const completed = await this.ctx.db.code.updateOne(
            {
                _id: params.tid,
                printer: params.cid,
                done: 0,
            },
            {
                $set: {
                    done: 1,
                    doneAt: Date.now(),
                },
            } as any,
        );
        if (!completed) throw new BadRequestError('Print task changed');
        await this.ctx.parallel('print/doneTask', client._id, `${client._id}#${physicalPrinter || 'unknown'}`);
        logger.info(`Client ${client.name} completed local print task ${code.tid}#${code._id}.`);
        this.response.body = { code: 1 };
    }
}

class ClientPrintReleaseHandler extends Handler {
    async post(params) {
        const client = await getClient(this.ctx, params.cid, 'printer');
        const code = await this.ctx.db.code.findOne({ _id: params.tid });
        if (!code) throw new ValidationError('Code', null, 'Code not found');
        if (code.printer !== params.cid || code.done) throw new BadRequestError('Print task changed');
        const released = await this.ctx.db.code.updateOne(
            {
                _id: params.tid,
                printer: params.cid,
                done: 0,
            },
            {
                $set: {
                    printer: '',
                    receivedAt: null,
                    targetPrinter: '',
                },
            } as any,
        );
        if (!released) throw new BadRequestError('Print task changed');
        logger.warn(`Client ${client.name} released print task ${code.tid}#${code._id}: ${String(params.error || 'local print failed')}`);
        this.response.body = { code: 1 };
    }
}

class ClientBallloonConnectHandler extends Handler {
    async post(params) {
        const client = await getClient(this.ctx, params.cid, 'balloon');
        const ip = this.request.ip.replace('::ffff:', '');
        logger.info(`Client ${client.name}(${ip}) connected.`);
        const balloons = await this.ctx.db.balloon.find({ printDone: 0, shouldPrint: true }).sort({ time: 1 });
        this.response.body = { balloons };
        logger.info(`Client ${client.name} connected, balloon ${balloons.length} tasks sent.`);
        await this.ctx.db.client.updateOne({ id: params.cid }, { $set: { updateAt: new Date().getTime(), ip } });
        await this.ctx.db.balloon.update({ balloonid: { $in: balloons.map((b) => b.balloonid) } },
            { $set: { receivedAt: new Date().getTime() } }, { multi: true });
        await this.ctx.parallel('balloon/sendTask', client._id, balloons.length);
    }
}

class ClientBalloonDoneHandler extends Handler {
    async post(params) {
        const client = await getClient(this.ctx, params.cid, 'balloon');
        const balloon = await this.ctx.db.balloon.findOne({ balloonid: params.bid });
        if (!balloon) throw new ValidationError('Balloon', params.bid, 'Balloon not found');
        await this.ctx.db.balloon.updateOne({ balloonid: params.bid }, { $set: { printDone: 1, printDoneAt: new Date().getTime() } });
        if (!balloon.done) await this.ctx.fetcher.setBalloonDone(balloon.balloonid);
        await this.ctx.parallel('balloon/doneTask', client._id, 1);
        this.response.body = { code: 1 };
        logger.info(`Client ${client.name} connected, balloon task ${balloon.teamid}#${balloon.balloonid} completed.`);
    }
}

export async function apply(ctx: Context) {
    await syncConfiguredClients(ctx);
    ctx.Route('client_control', '/client', ClientControlHandler);
    ctx.Route('client_print_fetch', '/client/:cid/print', ClientPrintConnectHandler);
    ctx.Route('client_print_done', '/client/:cid/doneprint/:tid', ClientPrintDoneHandler);
    ctx.Route('client_print_release', '/client/:cid/releaseprint/:tid', ClientPrintReleaseHandler);
    ctx.Route('client_balloon_fetch', '/client/:cid/balloon', ClientBallloonConnectHandler);
    ctx.Route('client_balloon_done', '/client/:cid/doneballoon/:bid', ClientBalloonDoneHandler);
}
