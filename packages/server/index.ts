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
    ctx.plugin(require('./service/db'));
    ctx.plugin(require('./service/fetcher'));
    ctx.inject(['server', 'dbservice', 'fetcher'], (c) => {
        c.plugin(require('./handler/misc'));
        c.plugin(require('./handler/printer'));
        c.plugin(require('./handler/monitor'));
        c.plugin(require('./handler/client'));
        c.plugin(require('./handler/balloon'));
        c.plugin(require('./handler/commands'));
        c.plugin(require('./handler/directCommand')); // 添加直接命令处理器
        c.plugin(require('./handler/monitorCommand')); // 新增 MonitorCommand 路由注册
        c.plugin(require('./handler/screenshot'));  // 添加截图路由处理器
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
    logger.success('Tools started');
    process.send?.('ready');
    await ctx.parallel('app/ready');
}

if (config) apply(app);
