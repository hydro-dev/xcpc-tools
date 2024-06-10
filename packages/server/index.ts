import os from 'os';
import path from 'path';
import { Context } from 'cordis';
import { fs, Logger } from './utils';

Logger.levels.base = 3;

const logger = new Logger('tools');

process.on('unhandledRejection', (e) => { logger.error(e); });
process.on('uncaughtException', (e) => { logger.error(e); });
Error.stackTraceLimit = 50;
const app = new Context();
const tmpdir = path.resolve(os.tmpdir(), 'xcpc-tools');
fs.ensureDirSync(tmpdir);

let config;
try {
    config = require('./config').config;
} catch (e) { }

async function applyServer(ctx: Context) {
    ctx.plugin(await import('./service/server'));
    ctx.plugin((await import('./service/db')).default);
    if (config.type !== 'server') {
        logger.info('Fetch mode: ', config.type);
        ctx.plugin(await import('./service/fetcher'));
    }
    ctx.plugin(await import('./handler/misc'));
    ctx.plugin(await import('./handler/printer'));
    ctx.plugin(await import('./handler/monitor'));
    ctx.plugin(await import('./handler/client'));
    ctx.plugin(await import('./handler/balloon'));
    ctx.plugin(await import('./handler/commands'));
}

async function applyClient(ctx: Context) {
    if (config.printers?.length) ctx.plugin(await import('./client/printer'));
    if (config.balloon) ctx.plugin(await import('./client/balloon'));
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

if (config) apply(app);
