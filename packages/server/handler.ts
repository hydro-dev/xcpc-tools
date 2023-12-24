/* eslint-disable no-await-in-loop */
import path from 'path';
import Datastore from 'nedb-promises';
import { AccessDeniedError, BadRequestError, ValidationError } from './error';
import { Context, PrintCode } from './interface';
import { Handler } from './service/server';
import { fs, Logger } from './utils';

fs.ensureDirSync(path.resolve(process.cwd(), 'data/.db'));
const db: Datastore<PrintCode> = Datastore.create(path.resolve(process.cwd(), 'data/.db/code.db'));

const logger = new Logger('handler');

class AuthHandler extends Handler {
    async prepare() {
        if (!this.request.headers.authorization) {
            this.response.status = 401;
            this.response.addHeader('WWW-Authenticate', 'Basic realm="XCPC Tools"');
            this.response.body = 'Authentication required';
            return 'cleanup';
        }
        const [uname, pass] = Buffer.from(this.request.headers.authorization.split(' ')[1], 'base64').toString().split(':');
        if (uname !== 'admin' || pass !== global.Tools.config.viewPassword.toString()) {
            this.response.status = 401;
            this.response.addHeader('WWW-Authenticate', 'Basic realm="XCPC Tools"');
            this.response.body = 'Authentication failed';
            return 'cleanup';
        }
        return 'next';
    }
}

class HomeHandler extends AuthHandler {
    async get() {
        const codes = await db.find({}).sort({ createAt: -1 });
        if (this.request.headers.accept === 'application/json') {
            this.response.body = ({
                tasks: codes,
                clients: global.Tools.clients,
                secretRoute: global.Tools.config.secretRoute,
            });
        } else {
            this.response.type = 'text/html';
            this.response.body = fs.readFileSync(path.resolve(__dirname, 'assets/index.html')).toString().replace('<!--DATA-->', JSON.stringify({
                tasks: codes,
                clients: global.Tools.clients,
                secretRoute: global.Tools.config.secretRoute,
            }));
        }
    }

    async postAddClient(params) {
        const client = global.Tools.clients.find((c) => c.name === params.name);
        if (client) throw new ValidationError('Client', null, 'Client already exists');
        const id = String.random(16);
        global.Tools.clients.push({ id, name: params.name || 'Unknown' });
        fs.writeFileSync(path.resolve(process.cwd(), 'data/client.json'), JSON.stringify(global.Tools.clients));
        this.back();
    }

    async postRemoveClient(params) {
        const client = global.Tools.clients.find((c) => c.id === params.id);
        if (!client) throw new ValidationError('Client', null, 'Client not found');
        global.Tools.clients = global.Tools.clients.filter((c) => c.id !== params.id);
        fs.writeFileSync(path.resolve(process.cwd(), 'data/client.json'), JSON.stringify(global.Tools.clients));
        this.back();
    }

    async postReprint(params) {
        const code = await db.findOne({ id: params.id });
        if (!code) {
            logger.info(code, params.id);
            throw new ValidationError('Code', null, 'Code not found');
        }
        await db.updateOne({ id: params.id }, { $set: { done: 0, printer: '' } });
        this.back();
    }

    async postDone(params) {
        const code = await db.find({ selector: { id: params.id }, limit: 1 });
        if (!code.length) {
            logger.info(code, params.id);
            throw new ValidationError('Code', null, 'Code not found');
        }
        await db.updateOne({ id: params.id }, { $set: { done: 1, doneAt: new Date().getTime() } });
        this.back();
    }

    async postRemove(params) {
        const codes = await db.find({ selector: { id: params.id }, limit: 1 });
        if (!codes.length) {
            logger.info(codes, params.id);
            throw new ValidationError('Code', null, 'Code not found');
        }
        await db.updateOne({ id: params.id }, { $set: { deleted: 1 } });
        this.back();
    }
}

class CodeHandler extends Handler {
    async post(params) {
        const {
            code, team, lang, filename, tname, location,
        } = params;
        if (!code && !this.request.files?.file) throw new BadRequestError('Code', null, 'Code is required');
        const id = `${team}-${String.random(8)}`;
        fs.ensureDirSync(path.resolve(process.cwd(), 'data/codes'));
        fs.writeFileSync(path.resolve(process.cwd(), 'data/codes', id), code || fs.readFileSync(this.request.files.file.filepath));
        await db.insert({
            id,
            team: `${team}: ${tname}`,
            location,
            filename: filename || this.request.files.file.originalFilename,
            lang: lang || 'txt',
            createAt: new Date().getTime(),
            printer: '',
            done: 0,
        });
        this.response.body = `The code has been submitted. Code Print ID: ${id}`;
        logger.info(`Team(${team}): ${tname} submitted code. Code Print ID: ${id}`);
        if (tname > 40) {
            logger.warn(`Team ${tname} name is too long, may cause overflow!`);
            this.response.body += ', your team name is too long, may cause print failed!';
        }
    }
}

class ClientConnectHandler extends Handler {
    async get(params) {
        const client = global.Tools.clients.find((c) => c.id === params.cid);
        if (!client) throw new AccessDeniedError('Client', null, 'Client not found');
        const code = await db.findOne({ printer: { $in: ['', params.cid] }, done: 0, deleted: { $ne: 1 } }).sort({ createAt: 1 });
        if (!code) {
            this.response.body = { code: 0 };
            return;
        }
        try {
            code.code = fs.readFileSync(path.resolve(process.cwd(), 'data/codes', code.id)).toString();
        } catch (e) {
            logger.error(e);
        }
        this.response.body = { code: 1, doc: code };
        logger.info(`Client ${client.name} connected, print task ${code.id}#${code._id} sent.`);
        await db.updateOne({ id: code.id }, { $set: { printer: params.cid, receivedAt: new Date().getTime() } });
    }
}

class ClientPrintDoneHandler extends Handler {
    async post(params) {
        const client = global.Tools.clients.find((c) => c._id === params.cid);
        if (!client) throw new AccessDeniedError('Client', null, 'Client not found');
        const code = await db.findOne({ _id: params.tid });
        if (!code) throw new ValidationError('Code', null, 'Code not found');
        if (code.printer !== params.cid) throw new BadRequestError('Client', null, 'Client not match');
        await db.updateOne({ _id: params.tid }, { $set: { done: 1, doneAt: new Date().getTime() } });
        this.response.body = { code: 1 };
        logger.info(`Client ${client.name} connected, print task ${code.id}#${code._id} completed.`);
    }
}

export async function apply(ctx: Context) {
    await db.load();
    await db.ensureIndex({ fieldName: 'id' });
    await db.ensureIndex({ fieldName: 'createAt' });
    await db.ensureIndex({ fieldName: 'done' });
    await db.ensureIndex({ fieldName: 'printer' });
    await db.ensureIndex({ fieldName: 'deleted' });
    logger.info('Code Database loaded');
    ctx.Route('home', '/', HomeHandler);
    ctx.Route('receive_code', `/print/${global.Tools.config.secretRoute}`, CodeHandler);
    logger.info(`Code Print Route: /print/${global.Tools.config.secretRoute}`);
    ctx.Route('client_fetch', '/client/:cid', ClientConnectHandler);
    ctx.Route('client_fetch', '/client/:cid/doneprint/:tid', ClientPrintDoneHandler);
}
