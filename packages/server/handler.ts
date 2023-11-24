/* eslint-disable no-await-in-loop */
import path from 'path';
import PouchDB from 'pouchdb';
import { fs, Logger } from '@hydrooj/utils';
import { BadRequestError } from './error';
import { Context } from './interface';
import { Handler, param, Types } from './service/server';

PouchDB.plugin(require('pouchdb-find'));
fs.ensureDirSync(path.resolve(__dirname, 'data/codeDatabase'));
const db = new PouchDB(path.resolve(__dirname, 'data/codeDatabase'));

const logger = new Logger('handler');
let fetcher = null;

class CodeHandler extends Handler {
    async get() {
        this.response.body = fs.readFileSync(path.resolve(__dirname, 'print.html'));
        this.response.type = 'text/html';
    }

    @param('code', Types.String, true)
    @param('team', Types.String, true)
    @param('filename', Types.String, true)
    @param('lang', Types.String, true)
    async post(code: string, team: string, filename: string, lang: string) {
        if (!code && !this.request.files?.file) throw new BadRequestError('Code', null, 'Code is required');
        const teamInfo = global.Contest.team.find((t) => t.id === team);
        if (!teamInfo) throw new BadRequestError('Team', null, 'Team not found');
        const id = `${team}-${String.random(8)}`;
        fs.ensureDirSync(path.resolve(__dirname, 'data/codes'));
        fs.writeFileSync(path.resolve(__dirname, 'data/codes', id), code || fs.readFileSync(this.request.files.file.filepath));
        await db.put({
            _id: `${team}-${String.random(8)}`,
            team: `${team}: ${teamInfo.name}`,
            location: teamInfo.location,
            filename,
            lang,
            printer: '',
        });
        this.response.body = { ok: 1 };
    }
}

class ClientConnectHandler extends Handler {
    @param('cid', Types.String)
    async get(cid: string) {
        const client = global.Tools.clients.find((c) => c.id === cid);
        if (!client) throw new BadRequestError('Client', null, 'Client not found');
        // no printer or printer = id
        const codes = await db.find({ selector: { printer: { $in: ['', cid] } } });
        for (const code of codes.docs) {
            try {
                code.code = fs.readFileSync(path.resolve(__dirname, 'data/codes', code._id));
                await db.update(code);
            } catch (e) {
                logger.error(e);
            }
        }
        const balloons = global.Contest.todoBalloons || [];
        this.response.body = {
            codes: codes.docs,
            balloons,
        };
    }

    @param('cid', Types.String)
    @param('bid', Types.String)
    async post(cid: string, bid: string) {
        const client = global.Tools.clients.find((c) => c.id === cid);
        if (!client) throw new BadRequestError('Client', null, 'Client not found');
        if (fetcher) await fetcher.setBalloonDone(bid);
        global.Contest.todoBalloons = global.Contest.todoBalloons.filter((b) => b.id !== bid);
    }
}

class AddClientHandler extends Handler {
    @param('name', Types.String, true)
    async get() {
        const client = global.Tools.clients.find((c) => c.name === this.request.query.name);
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
    ctx.Route('client_fetch', '/client/:id', ClientConnectHandler);
    ctx.Route('add_client', '/add_client', AddClientHandler);
    fetcher = ctx.fetcher;
}
