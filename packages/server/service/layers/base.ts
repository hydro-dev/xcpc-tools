import { PassThrough } from 'stream';
import type { Next } from 'koa';
import { pick } from 'lodash';
import type { HydroRequest, HydroResponse, KoaContext } from '../server';

export default async (ctx: KoaContext, next: Next) => {
    // Base Layer
    const request: HydroRequest = {
        method: ctx.request.method.toLowerCase(),
        host: ctx.request.host,
        hostname: ctx.request.hostname,
        ip: ctx.request.ip,
        headers: ctx.request.headers,
        cookies: ctx.cookies,
        ...pick(ctx, ['query', 'path', 'params', 'originalPath', 'querystring']),
        body: ctx.request.body,
        files: ctx.request.files as any,
        referer: ctx.request.headers.referer || '',
        json: (ctx.request.headers.accept || '').includes('application/json'),
        websocket: ctx.request.headers.upgrade === 'websocket',
    };
    request.ip = request.ip.split(',')[0].trim();
    const response: HydroResponse = {
        body: {},
        type: '',
        status: null,
        template: null,
        redirect: null,
        attachment: (name, streamOrBuffer) => {
            ctx.attachment(name);
            if (streamOrBuffer instanceof Buffer) {
                response.body = null;
                ctx.body = streamOrBuffer;
            } else {
                response.body = null;
                ctx.body = streamOrBuffer.pipe(new PassThrough());
            }
        },
        addHeader: (name: string, value: string) => ctx.set(name, value),
        disposition: null,
    };
    const args = {
        ...ctx.params, ...ctx.query, ...ctx.request.body, __start: Date.now(),
    };
    ctx.HydroContext = {
        request, response, args,
    };

    await next();
};
