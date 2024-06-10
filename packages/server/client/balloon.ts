import path from 'path';
import EscPosEncoder from '@freedom_sky/esc-pos-encoder';
import superagent from 'superagent';
import { config } from '../config';
import {
    fs, Logger, sleep,
} from '../utils';

const encoder = new EscPosEncoder();

export const receiptText = (
    id: number, location: string, problem: string, color: string, comment: string, teamname: string, status: string,
) => encoder
    .initialize()
    .codepage('cp936')
    .setPinterType(80) // wrong typo in the library
    .align('center')
    .bold(true)
    .size(2)
    .line('气球打印单')
    .emptyLine(1)
    .line(`ID: ${id}`)
    .emptyLine(1)
    .bold(false)
    .size(1)
    .line('===========================================')
    .emptyLine(1)
    .oneLine('座位', location)
    .oneLine('气球', problem)
    .oneLine('颜色', color)
    .oneLine('备注', comment)
    .emptyLine(1)
    .align('center')
    .bold(true)
    .line('===========================================')
    .emptyLine(2)
    .size(0)
    .line(`队伍: ${teamname}`)
    .line('队伍当前气球状态:')
    .line(`${status}`)
    .emptyLine(2)
    .line('Powered by hydro-dev/xcpc-tools')
    .emptyLine(3)
    .cut()
    .encode();

const logger = new Logger('fetcher');

let timer = null;
let printer = null;

async function printBalloon(doc) {
    const bReceipt = receiptText(
        doc.balloonid,
        doc.location ? doc.location : 'N/A',
        doc.problem,
        doc.contestproblem.color,
        doc.awards ? doc.awards : 'N/A',
        doc.team,
        doc.total ? Object.keys(doc.total).map((k) => `- ${k}: ${doc.total[k].color}`).join('\n') : 'N/A',
    );
    if (printer) {
        fs.writeFileSync(path.resolve(printer), bReceipt);
    }
}

async function fetchTask(c) {
    if (timer) clearTimeout(timer);
    logger.info('Fetching Task from tools server...');
    try {
        const { body } = await superagent.post(`${c.server}/client/${c.token}/balloon`).send();
        if (body.doc) {
            logger.info(`Print task ${body.doc.tid}#${body.doc._id}...`);
            await printBalloon(body.doc);
            await superagent.post(`${c.server}/client/${c.token}/doneballoon/${body.doc._id}`);
            logger.info(`Print task ${body.doc.tid}#${body.doc._id} completed.`);
        } else {
            logger.info('No print task, sleeping...');
            await sleep(5000);
        }
    } catch (e) {
        logger.error(e);
        await sleep(5000);
    }
    timer = setTimeout(() => fetchTask(c), 3000);
}

export async function apply() {
    printer = config.balloon;
    if (config.token && config.server && config.balloon) await fetchTask(config);
}
