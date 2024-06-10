import path from 'path';
import superagent from 'superagent';
import {
    fs, Logger, receiptText, sleep,
} from './utils';

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
    const { config } = global.Tools;
    if (!config) {
        logger.error('config not found');
        return;
    }
    printer = config.balloon;
    if (config.token && config.server && config.balloon) await fetchTask(config);
}
