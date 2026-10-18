import type { Context } from 'cordis';

export async function applyServer(ctx: Context) {
    await ctx.plugin(require('../service/config'));
    const configService = ctx.get('config') as any;
    if (!configService?.loaded) return;
    await ctx.plugin(require('../service/db').default);
    await ctx.plugin(require('../service/printers').PrintersService);
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
