import superagent from 'superagent';
import { Logger, sleep } from '@hydrooj/utils';
import { printFile } from './printer';

const logger = new Logger('fetcher');

let timer = null;

async function fetchTask(c) {
    if (timer) clearTimeout(timer);
    logger.info('Fetching Task from tools server...');
    try {
        const { body } = await superagent.get(`${c.server}/client/${c.token}`);
        if (body.code) {
            logger.info(`Print task ${body.doc._id}...`);
            await printFile(body.doc);
            await superagent.post(`${c.server}/client/${c.token}/doneprint/${body.doc._id}`);
            logger.info(`Print task ${body.doc._id} completed.`);
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
    if (config.token && config.server) await fetchTask(config);
}
