import path from 'node:path';
import { Context } from 'cordis';
import { BadRequestError, Handler, ValidationError } from '@hydrooj/framework';
import { ConvertCodeToPDF } from '../client/printer';
import { config } from '../config';
import { fs, Logger } from '../utils';
import { AuthHandler } from './misc';
import {
    CLIENT_ONLINE_WINDOW,
    clientHasTargetPrinter,
    collectPrinterTargets,
    normalizePrintGroup,
    printCandidates,
    resolvePrinterTarget,
} from './printRouting';

const logger = new Logger('handler/print');

class PrintAdminHandler extends AuthHandler {
    async get() {
        const codes = await this.ctx.db.code.find({ deleted: { $ne: 1 } }).sort({ createAt: -1 });
        const clients = (await this.ctx.db.client.find({}).sort({ createAt: 1 }))
            .filter((client) => Array.isArray(client.type) && client.type.includes('printer'));
        const now = Date.now();
        const clientStates = new Map(clients.map((client) => [client.id, client]));
        const printerTargets = collectPrinterTargets(clients as any[]);
        const routes = printerTargets.map((target) => {
            const client = clients.find((item) => item.id === target.clientId);
            const printerInfo = client?.printersInfo?.find((item) => item.printer === target.printer);
            const online = Boolean(client?.updateAt && client.updateAt >= now - CLIENT_ONLINE_WINDOW);
            const enabled = Boolean(client?.printers?.includes(target.printer));
            const healthy = clientHasTargetPrinter(client, target.printer, now);
            let reason = 'ready';
            if (!online) reason = 'client-offline';
            else if (!enabled) reason = 'printer-disabled';
            else if (!printerInfo) reason = 'printer-not-reported';
            else if (!healthy) reason = `printer-${printerInfo.status || 'unknown'}`;
            return {
                clientId: target.clientId,
                clientName: target.clientName,
                group: target.group,
                printer: target.printer,
                online,
                enabled,
                healthy,
                printerStatus: printerInfo?.status || 'unknown',
                reason,
            };
        });
        const clientsWithTasks = clients.map((client) => ({
            ...client,
            online: Boolean(client.updateAt && client.updateAt >= now - CLIENT_ONLINE_WINDOW),
            activeTasks: codes.filter((code) => !code.done && code.printer === client.id).length,
            completedTasks: codes.filter((code) => code.done && code.printer === client.id).length,
        }));
        const routedCodes = codes.map((code) => {
            if (code.printer) {
                const assignedClient = clients.find((client) => client.id === code.printer);
                const assignedTarget = printCandidates(
                    printerTargets,
                    code.group,
                    code.location,
                )
                    .find((target) => target.clientId === code.printer && target.printer === code.targetPrinter);
                return {
                    ...code,
                    matchedGroup: code.group || assignedTarget?.group || 'All',
                    targetClient: code.printer,
                    targetClientName: assignedClient?.name || code.printer,
                };
            }
            const candidates = printCandidates(
                printerTargets,
                code.group,
                code.location,
            );
            const target = resolvePrinterTarget(
                printerTargets,
                clientStates as any,
                code.group,
                code.location,
                '',
                now,
            );
            const configured = target || candidates[0];
            if (!configured) return code;
            return {
                ...code,
                matchedGroup: code.group || configured.group || 'All',
                targetClient: configured.clientId,
                targetClientName: configured.clientName,
                targetPrinter: configured.printer,
                routeAvailable: Boolean(target),
            };
        });
        this.response.body = {
            codes: routedCodes,
            clients: clientsWithTasks,
            routing: { routes },
        };
    }

    async postView(params) {
        const code = await this.ctx.db.code.findOne({ _id: params._id });
        if (!code) {
            logger.info(code, params._id);
            throw new ValidationError('Code', null, 'Code not found');
        }
        fs.ensureDirSync(path.resolve(process.cwd(), 'data/.pdf'));
        const content = fs.readFileSync(path.resolve(process.cwd(), 'data/codes', `${code.tid}#${code._id}`));
        const doc = await ConvertCodeToPDF(
            content,
            code.lang,
            code.filename,
            code.team,
            code.location,
            code.createAt,
            params.color ?? true,
        );
        this.response.type = 'application/pdf';
        this.response.disposition = 'attachment; filename="code.pdf"';
        this.response.body = Buffer.from(doc);
    }

    async postReprint(params) {
        const code = await this.ctx.db.code.findOne({ _id: params._id });
        if (!code) {
            logger.info(code, params._id);
            throw new ValidationError('Code', null, 'Code not found');
        }
        await this.ctx.db.code.updateOne({ _id: params._id }, {
            $set: {
                done: 0,
                printer: '',
                receivedAt: null,
                doneAt: null,
                remoteDoneAt: null,
                targetPrinter: '',
            },
        } as any);
        this.response.body = { success: true };
    }

    async postDone(params) {
        const code = await this.ctx.db.code.findOne({ _id: params._id });
        if (!code) {
            logger.info(code, params._id);
            throw new ValidationError('Code', null, 'Code not found');
        }
        if (!code.done && code.printer) throw new BadRequestError('Print task is currently assigned');
        await this.ctx.db.code.updateOne({ _id: params._id }, {
            $set: {
                done: 1,
                ...(!code.done && { doneAt: Date.now() }),
            },
        } as any);
        this.response.body = { success: true };
    }

    async postRemove(params) {
        const code = await this.ctx.db.code.findOne({ _id: params._id });
        if (!code) {
            logger.info(code, params._id);
            throw new ValidationError('Code', null, 'Code not found');
        }
        if (!code.done && code.printer) throw new BadRequestError('Print task is currently assigned');
        await this.ctx.db.code.updateOne({ _id: params._id }, { $set: { deleted: 1 } });
        this.response.body = { success: true };
    }
}

class CodeHandler extends Handler {
    async post(params) {
        const {
            code, team, lang, filename, tname, location, group,
        } = params;
        const uploadedFile = this.request.files?.file;
        if (!code && !uploadedFile) throw new BadRequestError('Code', null, 'Code is required');
        const sourceFilename = String(filename || uploadedFile?.originalFilename || 'code.txt');
        if (sourceFilename.includes('../')) throw new BadRequestError();
        const codeFile = code ? Buffer.from(String(code)) : fs.readFileSync(uploadedFile.filepath);
        if (!codeFile.length) throw new BadRequestError('Code', null, 'Code is empty');
        if (codeFile.length > 256 * 1024) throw new BadRequestError('Code', null, 'Code is larger than 256KB');
        const res = await this.ctx.db.code.insert({
            tid: team.toString(),
            team: `${team}: ${tname}`,
            location,
            group: normalizePrintGroup(group),
            filename: sourceFilename,
            lang: lang || 'txt',
            createAt: new Date().getTime(),
            printer: '',
            done: 0,
        });
        fs.ensureDirSync(path.resolve(process.cwd(), 'data/codes'));
        try {
            fs.writeFileSync(path.resolve(process.cwd(), 'data/codes', `${team}#${res._id}`), codeFile);
        } catch (error) {
            await this.ctx.db.code.removeOne({ _id: res._id }, {});
            throw error;
        }
        this.response.body = `The code has been submitted. Code Print ID: ${team}#${res._id}`;
        logger.info(`Team(${team}): ${tname} submitted code. Code Print ID: ${team}#${res._id}`);
        await this.ctx.parallel('print/newTask', 1);
        if (tname.length > 40) {
            logger.warn(`Team ${tname} name is too long, may cause overflow!`);
            this.response.body += ', your team name is too long, may cause print failed!';
        }
    }
}

export async function apply(ctx: Context) {
    ctx.Route('print_admin', '/print', PrintAdminHandler);
    ctx.Route('receive_code', `/print/${config.secretRoute}`, CodeHandler);
    logger.info(`Code Print Route: /print/${config.secretRoute}`);
}
