/* eslint-disable no-await-in-loop */
import path from 'path';
import { Context } from 'cordis';
import { BadRequestError, Handler, ValidationError } from '@hydrooj/framework';
import { ConvertCodeToPDF } from '../client/printer';
import { config } from '../config';
import { fs, Logger } from '../utils';
import { AuthHandler } from './misc';

const logger = new Logger('handler/print');

class PrintAdminHandler extends AuthHandler {
    async get() {
        const codes = await this.ctx.db.code.find({ deleted: { $ne: 1 } }).sort({ createAt: -1 });
        const clients = await this.ctx.db.client.find({ type: 'printer' }).sort({ createAt: 1 });
        this.response.body = { codes, clients };
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
        await this.ctx.db.code.updateOne({ _id: params._id }, { $set: { done: 0, printer: '' } });
        this.response.body = { success: true };
    }

    async postDone(params) {
        const code = await this.ctx.db.code.findOne({ _id: params._id });
        if (!code) {
            logger.info(code, params._id);
            throw new ValidationError('Code', null, 'Code not found');
        }
        await this.ctx.db.code.updateOne({ _id: params._id }, { $set: { done: 1, doneAt: new Date().getTime() } });
        this.response.body = { success: true };
    }

    async postRemove(params) {
        const code = await this.ctx.db.code.findOne({ _id: params._id });
        if (!code) {
            logger.info(code, params._id);
            throw new ValidationError('Code', null, 'Code not found');
        }
        await this.ctx.db.code.updateOne({ _id: params._id }, { $set: { deleted: 1 } });
        this.response.body = { success: true };
    }
}

class CodeHandler extends Handler {
    async post(params) {
        const {
            code, team, lang, filename, tname, location,
        } = params;
        if (!code && !this.request.files?.file) throw new BadRequestError('Code', null, 'Code is required');
        if ((filename || this.request.files.file.originalFilename).includes('../')) throw new BadRequestError();
        const res = await this.ctx.db.code.insert({
            tid: team.toString(),
            team: `${team}: ${tname}`,
            location,
            filename: filename || this.request.files.file.originalFilename,
            lang: lang || 'txt',
            createAt: new Date().getTime(),
            printer: '',
            done: 0,
        });
        const codeFile = code || fs.readFileSync(this.request.files.file.filepath);
        if (!codeFile) throw new BadRequestError('Code', null, 'Code is empty');
        if (codeFile.length > 256 * 1024) throw new BadRequestError('Code', null, 'Code is larger than 256KB');
        fs.ensureDirSync(path.resolve(process.cwd(), 'data/codes'));
        fs.writeFileSync(path.resolve(process.cwd(), 'data/codes', `${team}#${res._id}`), codeFile);
        this.response.body = `The code has been submitted. Code Print ID: ${team}#${res._id}`;
        logger.info(`Team(${team}): ${tname} submitted code. Code Print ID: ${team}#${res._id}`);
        await this.ctx.parallel('print/newTask');
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
