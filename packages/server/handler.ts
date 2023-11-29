/* eslint-disable no-await-in-loop */
import path from 'path';
import PouchDB from 'pouchdb';
import { fs, Logger } from '@hydrooj/utils';
import { BadRequestError } from './error';
import { Context } from './interface';
import { Handler } from './service/server';

PouchDB.plugin(require('pouchdb-find'));
fs.ensureDirSync(path.resolve(__dirname, 'data/codeDatabase'));
const db = new PouchDB(path.resolve(__dirname, 'data/codeDatabase'));

const logger = new Logger('handler');
let fetcher;

class CodeHandler extends Handler {
    async post(params) {
        const {
            code, team, lang, filename, tname, location,
        } = params;
        if (!code && !this.request.files?.file) throw new BadRequestError('Code', null, 'Code is required');
        const _id = `${team}-${String.random(8)}`;
        fs.ensureDirSync(path.resolve(__dirname, 'data/codes'));
        fs.writeFileSync(path.resolve(__dirname, 'data/codes', _id), code || fs.readFileSync(this.request.files.file.filepath));
        await db.put({
            _id,
            team: `${team}: ${tname}`,
            location,
            filename,
            lang,
            printer: '',
        });
        this.response.body = `The code has been submitted. Code Print ID: ${team}-${String.random(8)}`;
        logger.info(`Team(${team}): ${tname} submitted code: ${filename}(${lang})`);
    }
}

class ClientConnectHandler extends Handler {
    async get(params) {
        const client = global.Tools.clients.find((c) => c.id === params.cid);
        if (!client) throw new BadRequestError('Client', null, 'Client not found');
        // no printer or printer = id
        const codes = await db.find({ selector: { printer: { $in: ['', params.cid] } } });
        for (const code of codes.docs) {
            try {
                code.code = fs.readFileSync(path.resolve(__dirname, 'data/codes', code._id)).toString();
                await db.put(code);
            } catch (e) {
                logger.error(e);
            }
        }
        const balloons = global.Contest.todoBalloons || [];
        this.response.body = {
            codes: codes.docs,
            balloons,
        };
        logger.info(`Client ${client.name} connected`);
    }

    async post(params) {
        const { cid, bid } = params;
        const client = global.Tools.clients.find((c) => c.id === cid);
        if (!client) throw new BadRequestError('Client', null, 'Client not found');
        if (!bid) throw new BadRequestError('Balloon', null, 'Balloon is required');
        if (fetcher) await fetcher.setBalloonDone(bid);
        global.Contest.todoBalloons = global.Contest.todoBalloons.filter((b) => b.id !== bid);
    }
}

class AddClientHandler extends Handler {
    async get(params) {
        const client = global.Tools.clients.find((c) => c.name === params.name);
        if (client) throw new BadRequestError('Client', null, 'Client already exists');
        const id = String.random(16);
        global.Tools.clients.push({ id, name: this.request.query.name });
        fs.writeFileSync(path.resolve(__dirname, 'data/client.json'), JSON.stringify(global.Tools.clients));
        this.response.body = { id };
    }
}

export async function apply(ctx: Context) {
    await db.find({ selector: {} });
    logger.info('Code Database loaded');
    ctx.Route('receive_code', '/code_print', CodeHandler);
    ctx.Route('client_fetch', '/client/:cid', ClientConnectHandler);
    ctx.Route('add_client', '/add_client', AddClientHandler);
    fetcher = ctx.fetcher;
}
