import { Context } from 'cordis';
import proxy from 'koa-proxies';
import { ForbiddenError, WebService } from '@hydrooj/framework';
export * from '@hydrooj/framework/decorators';

export async function apply(pluginContext: Context) {
    pluginContext.plugin(WebService, {
        port: 5283,
    });
    pluginContext.inject(['server'], ({ server }) => {
        server.addServerLayer('stream', async (ctx, next) => {
            if (!ctx.path.startsWith('/stream/')) return await next();
            if (ctx.request.headers.authorization) {
                const [uname, pass] = Buffer.from(ctx.request.headers.authorization.split(' ')[1], 'base64').toString().split(':');
                if (uname !== 'admin' || pass !== global.Tools.config.viewPassword.toString()) throw new ForbiddenError();
            } else if (ctx.request.query.token) {
                if (ctx.request.query.token !== global.Tools.config.viewPassword.toString()) throw new ForbiddenError();
            } else throw new ForbiddenError();
            const redirectUrl = new URL(`http://${ctx.path.replace('/stream/', '')}`);
            const corsAllowHeaders = 'x-requested-with, accept, origin, content-type, upgrade-insecure-requests';
            return await proxy('/stream', {
                target: redirectUrl.origin,
                changeOrigin: true,
                logs: false,
                rewrite: () => redirectUrl.pathname,
                events: {
                    proxyRes: (proxyRes, req, res) => {
                        res.setHeader('Access-Control-Allow-Origin', '*');
                        res.setHeader('Access-Control-Allow-Headers', corsAllowHeaders);
                        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
                        res.setHeader('Access-Control-Allow-Credentials', 'true');
                        res.setHeader('X-Proxy-By', 'Hydro/XCPC-TOOLS');
                    },
                },
            })(ctx, next);
        });
    });
}
