import superagent from 'superagent';
import { Logger } from '@hydrooj/utils';
import { Context } from './interface';

const logger = new Logger('fetcher');

let timer = null;

async function fetchInfo(ctx, c) {
    if (timer) clearTimeout(timer);
    logger.info('Fetching info from tools server...');
    try {
        const { body } = await superagent.get(`${c.server}/client/${c.token}`);
        if (body.balloons) {
            logger.info(`Balloons: ${body.balloons.length}`);
            await Promise.all(body.balloons.map((doc) => ctx.parallel('balloon/print', doc)));
        }
        if (body.codes) {
            logger.info(`Codes: ${body.codes.length}`);
            await Promise.all(body.codes.map((doc) => ctx.parallel('code/print', doc)));
        }
    } catch (e) {
        logger.error(e);
    }
    timer = setTimeout(() => fetchInfo(ctx, c), 10000);
}

export async function apply(ctx: Context) {
    const { config } = global.Tools;
    if (!config) {
        logger.error('config not found');
        return;
    }
    if (config.token && config.server) await fetchInfo(ctx, config);
}
