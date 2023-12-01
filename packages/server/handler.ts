/* eslint-disable no-await-in-loop */
import path from 'path';
import { Environment, Loader } from 'nunjucks';
import PouchDB from 'pouchdb';
import { fs, Logger } from '@hydrooj/utils';
import { BadRequestError } from './error';
import { Context } from './interface';
import { Handler } from './service/server';

PouchDB.plugin(require('pouchdb-find'));
fs.ensureDirSync(path.resolve(process.cwd(), 'data/codeDatabase'));
const db = new PouchDB(path.resolve(process.cwd(), 'data/codeDatabase'));
db.createIndex({
    index: { fields: ['id', 'printer'] },
});

const logger = new Logger('handler');

class NLoader extends Loader {
    getSource(name) {
        return {
            src: fs.readFileSync(path.join(process.cwd(), 'home.html'), 'utf-8'),
            noCache: true,
        };
    }
}
class Nunjucks extends Environment {
    constructor() {
        super(new NLoader(), { autoescape: true, trimBlocks: true });
    }
}

const env = new Nunjucks();

class HomeHandler extends Handler {
    async get() {
        if (!this.request.headers.authorization) {
            this.response.status = 401;
            this.response.addHeader('WWW-Authenticate', 'Basic realm="XCPC Tools"');
            this.response.body = 'Authentication required';
            return;
        }
        const [uname, pass] = Buffer.from(this.request.headers.authorization.split(' ')[1], 'base64').toString().split(':');
        if (uname !== 'admin' || pass !== global.Tools.config.viewPassword.toString()) {
            this.response.status = 401;
            this.response.addHeader('WWW-Authenticate', 'Basic realm="XCPC Tools"');
            this.response.body = 'Authentication failed';
            return;
        }
        const codes = await db.find({ selector: {}, sort: [{ id: 'desc' }] });
        this.response.type = 'text/html';
        this.response.body = env.render('home.html', {
            tasks: codes.docs,
            clients: global.Tools.clients,
        });
    }

    async postAddClient(params) {
        const client = global.Tools.clients.find((c) => c.name === params.name);
        if (client) throw new BadRequestError('Client', null, 'Client already exists');
        const id = String.random(16);
        global.Tools.clients.push({ id, name: params.name });
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
        console.log(params.id);
        const codes = await db.find({ selector: { id: +params.id }, limit: 1 });
        if (!codes.docs.length) throw new BadRequestError('Code', null, 'Code not found');
        await db.put({
            ...codes.docs[0],
            done: 0,
            printer: '',
        });
        this.back();
    }

    async postDone(params) {
        const codes = await db.find({ selector: { id: +params.id }, limit: 1 });
        if (!codes.docs.length) throw new BadRequestError('Code', null, 'Code not found');
        await db.put({
            ...codes.docs[0],
            done: 1,
        });
        this.back();
    }
}

class CodeHandler extends Handler {
    async post(params) {
        const {
            code, team, lang, filename, tname, location,
        } = params;
        if (!code && !this.request.files?.file) throw new BadRequestError('Code', null, 'Code is required');
        const doc = await db.find({ selector: {}, sort: [{ id: 'desc' }], limit: 1 });
        const id = (doc.docs?.[0]?.id || 0) + 1;
        const _id = `${team}-${String.random(8)}`;
        fs.ensureDirSync(path.resolve(process.cwd(), 'data/codes'));
        fs.writeFileSync(path.resolve(process.cwd(), 'data/codes', _id), code || fs.readFileSync(this.request.files.file.filepath));
        await db.put({
            id,
            _id,
            team: `${team}: ${tname}`,
            location,
            filename: filename || this.request.files.file.originalFilename,
            lang: lang || 'txt',
            printer: '',
            done: 0,
        });
        this.response.body = `The code has been submitted. Code Print ID: ${id}#${_id}`;
        logger.info(`Team(${team}): ${tname} submitted code. Code Print ID: ${id}#${_id}`);
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
        this.response.body = { code: 1, doc: codes.docs[0] };
        logger.info(`Client ${client.name} connected, print task ${codes.docs[0].id}#${codes.docs[0]._id} sent.`);
        await db.put({
            ...codes.docs[0],
            printer: params.cid,
        });
    }
}

class ClientPrintDoneHandler extends Handler {
    async post(params) {
        const client = global.Tools.clients.find((c) => c.id === params.cid);
        if (!client) throw new BadRequestError('Client', null, 'Client not found');
        const codes = await db.find({ selector: { id: +params.tid }, limit: 1 });
        if (!codes.docs.length) throw new BadRequestError('Code', null, 'Code not found');
        if (codes.docs[0].printer !== params.cid) throw new BadRequestError('Client', null, 'Client not found');
        await db.put({
            ...codes.docs[0],
            done: 1,
        });
        this.response.body = { code: 1 };
        logger.info(`Client ${client.name} connected, print task ${codes.docs[0].id}#${codes.docs[0]._id} completed.`);
    }
}

export async function apply(ctx: Context) {
    await db.find({ selector: {} });
    logger.info('Code Database loaded');
    ctx.Route('home', '/', HomeHandler);
    ctx.Route('receive_code', '/print', CodeHandler);
    ctx.Route('client_fetch', '/client/:cid', ClientConnectHandler);
    ctx.Route('client_fetch', '/client/:cid/doneprint/:tid', ClientPrintDoneHandler);
}
