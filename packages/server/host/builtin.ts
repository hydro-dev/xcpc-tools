import type { Context } from 'cordis';

// ---------------------------------------------------------------------------
// Builtin entry points addressable from cordis.yml via the `xcpc:` scheme
// (routed by HostInclude, see host/loader.ts). Everything the previous
// hand-written boot wired up lives here; a cordis.yml then only decides
// which entries to load.
//
// rc.11 note: awaiting an `inject` wrapper only waits for its dependencies
// to become active, NOT for the callback body — so applyServer surfaces its
// completion through a deferred promise instead. The boot sequence in
// index.ts relies on that for its readiness definition.
// ---------------------------------------------------------------------------

export async function applyServer(ctx: Context) {
    // ConfigService loads config.server.yaml (template on first run); every
    // downstream consumer injects 'config' and reads ctx.config.config
    await ctx.plugin(require('../service/config'));
    const configService = ctx.get('config') as any;
    if (!configService?.loaded) return;
    // dbservice is required by everything downstream; register it here so
    // the loader path (which has no separate DBService entry) works too
    await ctx.plugin(require('../service/db').default);
    await Promise.all([
        ctx.plugin(require('../service/server')),
        ctx.plugin(require('../service/fetcher')),
    ]);
    await new Promise<void>((resolve) => {
        ctx.inject(['server', 'dbservice', 'fetcher'], async (c) => {
            await c.plugin(require('../service/ssh'));
            await c.plugin(require('../service/notifier'));
            await c.plugin(require('../handler/miscBase'));
            await Promise.all([
                c.plugin(require('../handler/misc')),
                c.plugin(require('../handler/printer')),
                c.plugin(require('../handler/monitor')),
                c.plugin(require('../handler/client')),
                c.plugin(require('../handler/balloon')),
                c.plugin(require('../handler/commands')),
                c.plugin(require('../handler/ssh')),
            ]);
            await c.server.listen();
            resolve();
        });
    });
}

export async function applyClient(ctx: Context) {
    await ctx.plugin(require('../service/config'));
    const configService = ctx.get('config') as any;
    if (!configService?.loaded) return;
    const config = configService.config;
    const localWeb = config.localWeb || {};
    if (localWeb.enabled !== false) {
        await ctx.plugin(require('../client/localWeb'), {
            host: localWeb.host || '127.0.0.1',
            port: localWeb.port || 5284,
        });
    }
    if (config.printers?.length) await ctx.plugin(require('../client/printer'));
    if (config.balloon) await ctx.plugin(require('../client/balloon'));
}

export const BUILTINS: Record<string, (ctx: Context) => Promise<void> | void> = {
    core: applyServer,
    client: applyClient,
};
