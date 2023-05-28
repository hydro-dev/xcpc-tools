import os from 'os';
import path from 'path';
import { fs, Logger } from '@hydrooj/utils';
import { Context } from './interface';

Logger.levels.base = 3;

const logger = new Logger('tools');

require('./init').load();
process.on('unhandledRejection', (e) => { logger.error(e); });
process.on('uncaughtException', (e) => { logger.error(e); });
Error.stackTraceLimit = 50;
global.app = new Context();
const tmpdir = path.resolve(os.tmpdir(), 'xcpc-tools');

async function loadHandlers(ctx: Context, handlers: string[]) {
    for (const handlerName of handlers) {
        try {
            // eslint-disable-next-line import/no-dynamic-require
            const handler = require(path.resolve(__dirname, 'handler', handlerName));
            logger.info(`handler init: ${handlerName}`);
            if (typeof handler['apply'] !== 'undefined') {
                // eslint-disable-next-line no-await-in-loop
                await handler.apply(ctx);
            }
        } catch (e) {
            logger.error(`handler init failed: ${handlerName}`);
            logger.error(e);
        }
    }
}

async function apply(ctx: Context) {
    fs.ensureDirSync(tmpdir);
    require('./error');
    // await require('./fetcher').apply(ctx);
    await require('./service/db').apply(ctx);
    await require('./service/storage').loadStorageService();
    await require('./service/server').apply(ctx);

    const handlerDir = path.resolve(__dirname, 'handler');
    const handlers = await fs.readdir(handlerDir);
    await loadHandlers(ctx, handlers);
    await ctx.lifecycle.flush();
    await ctx.parallel('app/started');
    logger.success('Server started');
    process.send?.('ready');
    await ctx.parallel('app/ready');
}

apply(global.app);
