import os from 'node:os';
import path from 'node:path';
import LoggerService from '@cordisjs/plugin-logger';
import { TimerService } from '@cordisjs/plugin-timer';
import { Context } from 'cordis';
import DBService from './service/db';
import { fs, Logger } from './utils';

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
    await Promise.all([
        ctx.plugin(require('./service/server')),
        ctx.plugin(require('./service/fetcher')),
    ]);
    await ctx.inject(['server', 'dbservice', 'fetcher'], async (c) => {
        await Promise.all([
            c.plugin(require('./handler/misc')),
            c.plugin(require('./handler/printer')),
            c.plugin(require('./handler/monitor'), config.monitor),
            c.plugin(require('./handler/client')),
            c.plugin(require('./handler/balloon')),
            c.plugin(require('./handler/commands')),
            c.plugin(require('./handler/directCommand')), // 添加直接命令处理器
            c.plugin(require('./handler/monitorCommand')), // 新增 MonitorCommand 路由注册
            c.plugin(require('./handler/screenshot')),  // 添加截图路由处理器
        ]);
        c.server.listen();
    });
}

function applyClient(ctx: Context) {
    if (config.printers?.length) ctx.plugin(require('./client/printer'));
    if (config.balloon) ctx.plugin(require('./client/balloon'));
}

async function apply(ctx) {
    if (process.argv.includes('--client')) {
        applyClient(ctx);
    } else {
        ctx.plugin(DBService);
        ctx.inject(['dbservice'], (c) => {
            applyServer(c);
        });
    }
    logger.success('Tools started');
    process.send?.('ready');
    await ctx.parallel('app/ready');
}

app.plugin(TimerService);
app.plugin(LoggerService, {
    console: {
        showDiff: false,
        showTime: 'dd hh:mm:ss',
        label: {
            align: 'right',
            width: 9,
            margin: 1,
        },
        levels: { default: process.env.DEV ? 3 : 2 },
    },
});

if (config) app.inject(['logger', 'timer'], (ctx) => apply(ctx));
