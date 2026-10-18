import os from 'node:os';
import path from 'node:path';
import ConsoleExporter from '@cordisjs/plugin-logger-console';
import { TimerService } from '@cordisjs/plugin-timer';
import { httpServer } from '@hydrooj/framework';
import { Context } from 'cordis';
import { BUILTINS } from './host/builtin';
import { livenessCheck, registerLoaderRef, startFromConfig } from './host/loader';
import { prevalidateYml, resolveConfigPath } from './host/probe';
import { fs } from './utils';

process.on('unhandledRejection', (e) => { ctx.logger('app').error(e); });
process.on('uncaughtException', (e) => { ctx.logger('app').error(e); });
Error.stackTraceLimit = 50;
const ctx = new Context();
const tmpdir = path.resolve(os.tmpdir(), 'xcpc-tools');
fs.ensureDirSync(tmpdir);

// The framework's WebService.listen() only resolves its promise on success —
// a port conflict (EADDRINUSE) surfaces as an 'error' event on the module
// level httpServer and would otherwise hang the boot forever. Register the
// guard BEFORE any plugin can call listen().
httpServer.on('error', (error: NodeJS.ErrnoException) => {
    // eslint-disable-next-line no-console
    console.error(`http server error: ${error.code ?? error.message}`);
    process.exit(1);
});

// Boot order (rev.5 §2.0b/c):
//   1. services (timer, console logger exporter)
//   2. plugins   — loader path (cordis.yml) with prevalidation + liveness
//                 check, or the builtin path with awaited fibers
//   3. only then: "Tools started" log + 'ready' message + app/ready notify
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
    const { configPath } = resolveConfigPath();
    const isClient = process.argv.includes('--client');
    if (configPath) {
        // loader path: explicit opt-in via cordis.yml next to the binary
        prevalidateYml(configPath); // layer 1: fast-fail, exit(1) on bad yml
        registerLoaderRef(ctx);
        await startFromConfig(ctx, configPath); // layer 2 gate:
        livenessCheck(configPath); // every entry ACTIVE or exit(1)
    } else {
        // builtin path: identical wiring, but awaited this time — "started"
        // is only logged after the required services are actually active
        // (config.ts may throw 'no-config' after writing a template; that
        // is the existing first-run UX and must stay non-fatal)
        let config: any = null;
        try {
            config = require('./config').config;
        } catch (e: any) {
            if (e.message !== 'no-config') throw e;
        }
        if (!config) return;
        if (isClient) {
            await ctx.plugin(BUILTINS.client!);
        } else {
            // applyServer registers DBService itself and resolves only after
            // the http server is listening (see host/builtin.ts)
            await ctx.plugin(BUILTINS.core!);
        }
    }
    // The httpServer 'error' guard was registered before boot (see top of
    // file): a port conflict must exit(1) instead of hanging inside listen().
    ctx.logger('app').info('Tools started');
    process.send?.('ready');
    // notification semantics only — no listener exists today; external
    // plugins may use it later. Not a readiness barrier.
    await ctx.parallel('app/ready');
}

boot().catch((error) => {
    // eslint-disable-next-line no-console
    console.error(error);
    process.exit(1);
});
