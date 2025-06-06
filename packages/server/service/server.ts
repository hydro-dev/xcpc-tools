import { Context } from 'cordis';
import proxy from 'koa-proxies';
import { ForbiddenError, WebService } from '@hydrooj/framework';
import { config } from '../config';
export * from '@hydrooj/framework/decorators';

export async function apply(pluginContext: Context) {
    pluginContext.plugin(WebService, {
        host: '0.0.0.0',
        port: config.port,
    } as any);
    pluginContext.inject(['server'], ({ server }) => {
        server.addServerLayer('stream', async (ctx, next) => {
            if (!ctx.path.startsWith('/stream/')) return await next();
            if (ctx.request.headers.authorization) {
                const [uname, pass] = Buffer.from(ctx.request.headers.authorization.split(' ')[1], 'base64').toString().split(':');
                if (uname !== 'admin' || pass !== config.viewPass.toString()) throw new ForbiddenError();
            } else if (ctx.request.query.token) {
                if (ctx.request.query.token !== config.viewPass.toString()) throw new ForbiddenError();
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
                        res.setHeader('X-Proxy-By', 'hydro-dev/xcpc-tools');

                        // https://github.com/vercel/next.js/blob/main/packages/next/src/server/lib/router-utils/proxy-request.ts
                        const cleanup = (err: Error) => {
                            // cleanup event listeners to allow clean garbage collection
                            proxyRes.removeListener('error', cleanup);
                            proxyRes.removeListener('close', cleanup);
                            res.removeListener('error', cleanup);
                            res.removeListener('close', cleanup);

                            // destroy all source streams to propagate the caught event backward
                            req.destroy(err);
                            proxyRes.destroy(err);
                        };

                        proxyRes.once('error', cleanup);
                        proxyRes.once('close', cleanup);
                        res.once('error', cleanup);
                        res.once('close', cleanup);
                    },
                },
            })(ctx, next);
        });
    });
}
