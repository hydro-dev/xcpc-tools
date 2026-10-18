import os from 'node:os';
import path from 'node:path';
import ConsoleExporter from '@cordisjs/plugin-logger-console';
import { TimerService } from '@cordisjs/plugin-timer';
import { httpServer } from '@hydrooj/framework';
import { Context } from 'cordis';
import { BUILTINS } from './host/builtin';
import { bindLogger, exitWithError } from './host/fail';
import { livenessCheck, startFromConfig } from './host/loader';
import { prevalidateYml, resolveConfigPath } from './host/probe';
import { fs } from './utils';

Error.stackTraceLimit = 50;
const ctx = new Context();
const tmpdir = path.resolve(os.tmpdir(), 'xcpc-tools');
fs.ensureDirSync(tmpdir);

process.on('unhandledRejection', (e) => { ctx.logger('app').error(e); });
process.on('uncaughtException', (e) => { ctx.logger('app').error(e); });

httpServer.on('error', (error: NodeJS.ErrnoException) => {
    exitWithError(`http server error: ${error.code ?? error.message}`);
});

async function boot() {
    ctx.plugin(TimerService);
    await ctx.plugin(ConsoleExporter, {
        showDiff: false,
        showTime: 'dd hh:mm:ss',
        label: {
            align: 'right',
            width: 9,
            margin: 1,
        },
        levels: { default: process.env.DEV ? 3 : 2 },
    } as any);
    bindLogger(ctx);
    const { configPath } = resolveConfigPath();
    const isClient = process.argv.includes('--client');
    if (configPath) {
        prevalidateYml(configPath);
        await startFromConfig(ctx, configPath);
        livenessCheck(ctx, configPath);
    } else {
        if (isClient) {
            await ctx.plugin(BUILTINS.client!);
        } else {
            await ctx.plugin(BUILTINS.core!);
        }
    }
    ctx.logger('app').info('Tools started');
    process.send?.('ready');
    await ctx.parallel('app/ready');
}

boot().catch((error) => {
    exitWithError(error instanceof Error ? error.stack || error.message : String(error));
});
