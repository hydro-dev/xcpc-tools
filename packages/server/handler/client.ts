import path from 'path';
import { AccessDeniedError, BadRequestError, ValidationError } from '../error';
import { Context } from '../interface';
import { Handler } from '../service/server';
import { fs, Logger } from '../utils';
import { AuthHandler } from './misc';

const logger = new Logger('handler/client');

class ClientControlHandler extends AuthHandler {
    async get() {
        const clients = await this.ctx.db.client.find({}).sort({ createAt: 1 });
        this.response.body = { clients };
    }

    async postAdd(params) {
        const { name, type } = params;
        const client = await this.ctx.db.client.findOne({ name });
        if (client) throw new ValidationError('Client', null, 'Client already exists');
        const id = String.random(6);
        await this.ctx.db.client.insert({
            id,
            name,
            type,
            createAt: new Date().getTime(),
        });
        this.response.body = { id };
    }

    async postRemove(params) {
        const client = await this.ctx.db.client.findOne({ id: params.id });
        if (!client) throw new ValidationError('Client', null, 'Client not found');
        await this.ctx.db.client.removeOne({ id: params.id }, {});
        this.response.body = { success: true };
    }
}

class ClientConnectHandler extends Handler {
    async post(params) {
        const client = await this.ctx.db.client.findOne({ id: params.cid });
        if (!client) throw new AccessDeniedError('Client', null, 'Client not found');
        const ip = this.request.ip.replace('::ffff:', '');
        logger.info(`Client ${client.name}(${ip}) connected.`);
        if (params.printersInfo) {
            await this.ctx.db.client.updateOne(
                { id: params.cid },
                {
                    $set: {
                        printers: params.printers,
                        printersInfo: JSON.parse(params.printersInfo),
                        updateAt: new Date().getTime(),
                        ip,
                    },
                },
            );
        }
        const code = await this.ctx.db.code.findOne({ printer: { $in: ['', params.cid] }, done: 0, deleted: { $ne: 1 } }).sort({ createAt: 1 });
        if (!code) {
            this.response.body = { code: 0 };
            return;
        }
        try {
            code.code = fs.readFileSync(path.resolve(process.cwd(), 'data/codes', `${code.tid}#${code._id}`)).toString();
        } catch (e) {
            logger.error(e);
        }
        this.response.body = { doc: code };
        if (params.printer && params.printer !== code.printer) this.response.body.setPrinter = code.printer;
        logger.info(`Client ${client.name} connected, print task ${code.tid}#${code._id} sent.`);
        await this.ctx.db.code.updateOne({ _id: code._id }, { $set: { printer: params.cid, receivedAt: new Date().getTime() } });
    }
}

class ClientPrintDoneHandler extends Handler {
    async post(params) {
        const client = await this.ctx.db.client.findOne({ id: params.cid });
        if (!client) throw new AccessDeniedError('Client', null, 'Client not found');
        const code = await this.ctx.db.code.findOne({ _id: params.tid });
        if (!code) throw new ValidationError('Code', null, 'Code not found');
        if (code.printer !== params.cid) throw new BadRequestError('Client', null, 'Client not match');
        await this.ctx.db.code.updateOne({ _id: params.tid }, { $set: { done: 1, doneAt: new Date().getTime() } });
        this.response.body = { code: 1 };
        logger.info(`Client ${client.name} connected, print task ${code.tid}#${code._id} completed.`);
    }
}

export async function apply(ctx: Context) {
    ctx.Route('client_control', '/client', ClientControlHandler);
    ctx.Route('client_fetch', '/client/:cid', ClientConnectHandler);
    ctx.Route('client_print_done', '/client/:cid/doneprint/:tid', ClientPrintDoneHandler);
}
