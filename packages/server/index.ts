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
} catch (e) {
    if (e.message !== 'no-config') throw e;
}

async function applyServer(ctx: Context) {
    ctx.plugin(require('./service/server'));
    ctx.plugin((require('./service/db')).default);
    if (config.type !== 'server') {
        logger.info('Fetch mode: ', config.type);
        ctx.plugin(require('./service/fetcher'));
    }
    ctx.plugin(require('./handler/misc'));
    ctx.plugin(require('./handler/printer'));
    ctx.plugin(require('./handler/monitor'));
    ctx.plugin(require('./handler/client'));
    ctx.plugin(require('./handler/balloon'));
    ctx.plugin(require('./handler/commands'));
    ctx.inject(['server'], (c) => {
        c.server.listen();
    });
}

async function applyClient(ctx: Context) {
    if (config.printers?.length) ctx.plugin(require('./client/printer'));
    if (config.balloon) ctx.plugin(require('./client/balloon'));
}

async function apply(ctx) {
    if (process.argv.includes('--client')) {
        await applyClient(ctx);
    } else {
        await applyServer(ctx);
    }
    await ctx.lifecycle.flush();
    await ctx.parallel('app/listen');
    logger.success('Server started');
    process.send?.('ready');
    await ctx.parallel('app/ready');
}

if (config) apply(app);
