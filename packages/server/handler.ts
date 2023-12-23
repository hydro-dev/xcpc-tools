/* eslint-disable no-await-in-loop */
import path from 'path';
import PouchDB from 'pouchdb';
import { AccessDeniedError, BadRequestError } from './error';
import { Context } from './interface';
import { Handler } from './service/server';
import { fs, Logger } from './utils';

PouchDB.plugin(require('pouchdb-find'));
fs.ensureDirSync(path.resolve(process.cwd(), 'data/codeDatabase'));
const db = new PouchDB(path.resolve(process.cwd(), 'data/codeDatabase'));
db.createIndex({
    index: { fields: ['createAt', '_id', 'printer'] },
});

const logger = new Logger('handler');

class AuthHandler extends Handler {
    async prepare() {
        if (!this.request.headers.authorization) {
            this.response.addHeader('WWW-Authenticate', 'Basic realm="XCPC Tools"');
            this.response.body = 'Authentication required';
            throw new AccessDeniedError('Auth', null, 'Authentication required');
        }
        const [uname, pass] = Buffer.from(this.request.headers.authorization.split(' ')[1], 'base64').toString().split(':');
        if (uname !== 'admin' || pass !== global.Tools.config.viewPassword.toString()) {
            this.response.addHeader('WWW-Authenticate', 'Basic realm="XCPC Tools"');
            this.response.body = 'Authentication failed';
            throw new AccessDeniedError('Auth', null, 'Authentication failed');
        }
    }
}

class HomeHandler extends AuthHandler {
    async get() {
        const codes = await db.find({ selector: {}, sort: [{ createAt: 'desc' }] });
        if (this.request.headers.accept === 'application/json') {
            this.response.body = ({
                tasks: codes.docs,
                clients: global.Tools.clients,
                secretRoute: global.Tools.config.secretRoute,
            });
        } else {
            this.response.type = 'text/html';
            this.response.body = fs.readFileSync(path.resolve(__dirname, 'assets/index.html')).toString().replace('<!--DATA-->', JSON.stringify({
                tasks: codes.docs,
                clients: global.Tools.clients,
                secretRoute: global.Tools.config.secretRoute,
            }));
        }
    }

    async postAddClient(params) {
        const client = global.Tools.clients.find((c) => c.name === params.name);
        if (client) throw new BadRequestError('Client', null, 'Client already exists');
        const id = String.random(16);
        global.Tools.clients.push({ id, name: params.name || 'Unknown' });
        fs.writeFileSync(path.resolve(process.cwd(), 'data/client.json'), JSON.stringify(global.Tools.clients));
        this.back();
    }

    async postRemoveClient(params) {
        const client = global.Tools.clients.find((c) => c.id === params.id);
        if (!client) throw new BadRequestError('Client', null, 'Client not found');
        global.Tools.clients = global.Tools.clients.filter((c) => c.id !== params.id);
        fs.writeFileSync(path.resolve(process.cwd(), 'data/client.json'), JSON.stringify(global.Tools.clients));
        this.back();
    }

    async postReprint(params) {
        const codes = await db.find({ selector: { _id: params.id }, limit: 1 });
        if (!codes.docs.length) {
            logger.info(codes.docs, params.id);
            throw new BadRequestError('Code', null, 'Code not found');
        }
        await db.put({
            ...codes.docs[0],
            done: 0,
            printer: '',
        });
        this.back();
    }

    async postDone(params) {
        const codes = await db.find({ selector: { _id: params.id }, limit: 1 });
        if (!codes.docs.length) {
            logger.info(codes.docs, params.id);
            throw new BadRequestError('Code', null, 'Code not found');
        }
        await db.put({
            ...codes.docs[0],
            done: 1,
        });
        this.back();
    }

    async postRemove(params) {
        const codes = await db.find({ selector: { _id: params.id }, limit: 1 });
        if (!codes.docs.length) {
            logger.info(codes.docs, params.id);
            throw new BadRequestError('Code', null, 'Code not found');
        }
        await db.remove(codes.docs[0]);
        this.back();
    }
}

class CodeHandler extends Handler {
    async post(params) {
        const {
            code, team, lang, filename, tname, location,
        } = params;
        if (!code && !this.request.files?.file) throw new BadRequestError('Code', null, 'Code is required');
        const _id = `${team}-${String.random(8)}`;
        fs.ensureDirSync(path.resolve(process.cwd(), 'data/codes'));
        fs.writeFileSync(path.resolve(process.cwd(), 'data/codes', _id), code || fs.readFileSync(this.request.files.file.filepath));
        await db.put({
            _id,
            team: `${team}: ${tname}`,
            location,
            filename: filename || this.request.files.file.originalFilename,
            lang: lang || 'txt',
            createAt: new Date().getTime(),
            printer: '',
            done: 0,
        });
        this.response.body = `The code has been submitted. Code Print ID: ${_id}`;
        logger.info(`Team(${team}): ${tname} submitted code. Code Print ID: ${_id}`);
        if (tname > 40) {
            logger.warn(`Team ${tname} name is too long, may cause overflow!`);
            this.response.body += ', your team name is too long, may cause print failed!';
        }
    }
}

class ClientConnectHandler extends Handler {
    async get(params) {
        const client = global.Tools.clients.find((c) => c.id === params.cid);
        if (!client) throw new BadRequestError('Client', null, 'Client not found');
        const codes = await db.find({ selector: { done: 0, printer: { $in: ['', params.cid] } }, limit: 1 });
        if (!codes.docs.length) {
            this.response.body = { code: 0 };
            return;
        }
        try {
            codes.docs[0].code = fs.readFileSync(path.resolve(process.cwd(), 'data/codes', codes.docs[0]._id)).toString();
        } catch (e) {
            logger.error(e);
        }
        this.response.body = { code: 1, doc: { ...codes.docs[0] } };
        logger.info(`Client ${client.name} connected, print task ${codes.docs[0]._id} sent.`);
        await db.put({
            ...codes.docs[0],
            printer: params.cid,
            receiveAt: new Date().getTime(),
        });
    }
}

class ClientPrintDoneHandler extends Handler {
    async post(params) {
        const client = global.Tools.clients.find((c) => c.id === params.cid);
        if (!client) throw new BadRequestError('Client', null, 'Client not found');
        const codes = await db.find({ selector: { _id: params.tid }, limit: 1 });
        if (!codes.docs.length) throw new BadRequestError('Code', null, 'Code not found');
        if (codes.docs[0].printer !== params.cid) throw new BadRequestError('Client', null, 'Client not found');
        await db.put({
            ...codes.docs[0],
            done: 1,
            doneAt: new Date().getTime(),
        });
        this.response.body = { code: 1 };
        logger.info(`Client ${client.name} connected, print task ${codes.docs[0]._id} completed.`);
    }
}

export async function apply(ctx: Context) {
    await db.find({ selector: {} });
    logger.info('Code Database loaded');
    ctx.Route('home', '/', HomeHandler);
    ctx.Route('receive_code', `/print/${global.Tools.config.secretRoute}`, CodeHandler);
    logger.info(`Code Print Route: /print/${global.Tools.config.secretRoute}`);
    ctx.Route('client_fetch', '/client/:cid', ClientConnectHandler);
    ctx.Route('client_fetch', '/client/:cid/doneprint/:tid', ClientPrintDoneHandler);
}
