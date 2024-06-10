import os from 'os';
import path from 'path';
import { Context } from 'cordis';
import { config } from './config';
import { fs, Logger } from './utils';

Logger.levels.base = 3;

const logger = new Logger('tools');

process.on('unhandledRejection', (e) => { logger.error(e); });
process.on('uncaughtException', (e) => { logger.error(e); });
Error.stackTraceLimit = 50;
const app = new Context();
const tmpdir = path.resolve(os.tmpdir(), 'xcpc-tools');
fs.ensureDirSync(tmpdir);

async function applyServer(ctx: Context) {
    fs.ensureDirSync(tmpdir);
    await require('./service/server').apply(ctx);
    await require('./service/db').apply(ctx);
    if (config.type !== 'server') {
        logger.info('Fetch mode: ', config.type);
        await require('./service/fetcher').apply(ctx);
    }
    await require('./handler/misc').apply(ctx);
    await require('./handler/printer').apply(ctx);
    await require('./handler/monitor').apply(ctx);
    await require('./handler/client').apply(ctx);
    await require('./handler/balloon').apply(ctx);
    await require('./handler/commands').apply(ctx);
}

async function applyClient(ctx: Context) {
    if (config.printers?.length) await require('./client/printer').apply(ctx);
    if (config.balloon) await require('./client/balloon').apply(ctx);
}

async function apply(ctx) {
    if (process.argv.includes('--client')) {
        await applyClient(ctx);
    } else {
        await applyServer(ctx);
    }
    await ctx.lifecycle.flush();
    await ctx.parallel('app/started');
    process.send?.('ready');
    logger.success('Server started');
    await ctx.parallel('app/ready');
}

apply(app);
