import http from 'http';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import cac from 'cac';
import { Service } from 'cordis';
import type { Files } from 'formidable';
import Koa from 'koa';
import Body from 'koa-body';
import Compress from 'koa-compress';
import Router from 'koa-router';
import cache from 'koa-static-cache';
import {
    CsrfTokenError, HydroError, InvalidOperationError,
    MethodNotAllowedError, NotFoundError,
    PrivilegeError, UserFacingError,
} from '../error';
import { Context } from '../interface';
import {
    Counter, errorMessage, fs,
    isClass, Logger,
} from '../utils';
import * as decorators from './decorators';
import baseLayer from './layers/base';
import responseLayer from './layers/response';

export * from './decorators';
export * from '../lib';

export interface HydroRequest {
    method: string;
    host: string;
    hostname: string;
    ip: string;
    headers: Koa.Request['headers'];
    cookies: any;
    body: any;
    files: Record<string, import('formidable').File>;
    query: any;
    querystring: string;
    path: string;
    originalPath: string;
    params: any;
    referer: string;
    json: boolean;
    websocket: boolean;
}
export interface HydroResponse {
    body: any;
    type: string;
    status: number;
    template?: string;
    /** If set, and pjax content was request from client,
     *  The template will be used for rendering.
     */
    pjax?: string;
    redirect?: string;
    disposition?: string;
    etag?: string;
    attachment: (name: string, stream?: any) => void;
    addHeader: (name: string, value: string) => void;
}
interface HydroContext {
    request: HydroRequest;
    response: HydroResponse;
    args: Record<string, any>;
}
export interface KoaContext extends Koa.Context {
    HydroContext: HydroContext;
    handler: any;
    session: Record<string, any>;
    request: Koa.Request & { body: any, files: Files };
    render: (name: string, args: any) => Promise<void>;
    renderHTML: (name: string, args: any) => Promise<string>;
    getUrl: (name: string, args: any) => string;
    translate: (key: string) => string;
}

const argv = cac().parse();
const logger = new Logger('server');
export const app = new Koa<Koa.DefaultState, KoaContext>();
export const router = new Router();
export const httpServer = http.createServer(app.callback());
export const captureAllRoutes = {};
app.on('error', (error) => {
    if (error.code !== 'EPIPE' && error.code !== 'ECONNRESET' && !error.message.includes('Parse Error')) {
        logger.error('Koa app-level error', { error });
    }
});

export class HandlerCommon {
    url: (name: string, args?: any) => string;
    session: Record<string, any>;
    ctx: Context = global.app;

    constructor(
        public context: KoaContext, public args: Record<string, any>,
        public request: HydroRequest, public response: HydroResponse,
    ) {
        this.url = context.getUrl.bind(context);
        this.session = context.session;
    }

    checkPriv(...priv: number[]) {
        for (const i in priv) {
            if ((this.session.priv & priv[i]) === priv[i]) return true;
        }
        throw new PrivilegeError(...priv);
    }
}

export class Handler extends HandlerCommon {
    noCheckPermView = false;
    allowCors = false;
    __param: Record<string, decorators.ParamOption<any>[]>;

    back(body?: any) {
        this.response.body = body || this.response.body || {};
        this.response.redirect = this.request.headers.referer || '/';
    }

    binary(data: any, name?: string) {
        this.response.body = data;
        this.response.template = undefined;
        this.response.type = 'application/octet-stream';
        if (name) this.response.disposition = `attachment; filename="${name}"`;
    }

    async init() {
        if (this.request.method === 'post' && this.request.headers.referer && !this.context.cors && !this.allowCors) {
            const host = new URL(this.request.headers.referer).host;
            if (host !== this.request.host) this.context.pendingError = new CsrfTokenError(host);
        }
        if (this.context.pendingError) throw this.context.pendingError;
    }

    async onerror(error: HydroError) {
        error.msg ||= () => error.message;
        if (error instanceof UserFacingError && !process.env.DEV) error.stack = '';
        if (!(error instanceof NotFoundError) && !('nolog' in error)) {
            logger.error(`User: ${this.request.method}: ${this.request.path}`, error.msg(), error.params);
            if (error.stack) logger.error(error.stack);
        }
        this.response.status = error instanceof UserFacingError ? error.code : 500;
        this.response.body = {
            UserFacingError,
            error: { message: error.msg(), params: error.params, stack: errorMessage(error.stack || '') },
        };
    }
}

async function serial(name: string, ...args: any[]) {
    const r = await (global.app.serial as any)(name, ...args);
    if (r instanceof Error) throw r;
    return r;
}

async function handle(ctx: KoaContext, HandlerClass, checker) {
    const {
        args, request, response,
    } = ctx.HydroContext;
    Object.assign(args, ctx.params);
    const h = new HandlerClass(ctx, args, request, response);
    ctx.handler = h;
    try {
        const method = ctx.method.toLowerCase();
        const operation = (method === 'post' && ctx.request.body?.operation)
            ? `_${ctx.request.body.operation}`.replace(/_([a-z])/gm, (s) => s[1].toUpperCase())
            : '';

        if (checker) checker.call(h);
        if (method === 'post') {
            if (operation) {
                if (typeof h[`post${operation}`] !== 'function') {
                    throw new InvalidOperationError(operation);
                }
            } else if (typeof h.post !== 'function') {
                throw new MethodNotAllowedError(method);
            }
        } else if (typeof h[method] !== 'function' && typeof h.all !== 'function') {
            throw new MethodNotAllowedError(method);
        }

        const name = HandlerClass.name.replace(/Handler$/, '');
        const steps = [
            'init', 'handler/init',
            `handler/before-prepare/${name}#${method}`, `handler/before-prepare/${name}`, 'handler/before-prepare',
            'log/__prepare', '__prepare', '_prepare', 'prepare', 'log/__prepareDone',
            `handler/before/${name}#${method}`, `handler/before/${name}`, 'handler/before',
            'log/__method', 'all', method, 'log/__methodDone',
            ...operation ? [
                `handler/before-operation/${name}`, 'handler/before-operation',
                `post${operation}`, 'log/__operationDone',
            ] : [], 'after',
            `handler/after/${name}#${method}`, `handler/after/${name}`, 'handler/after',
            'cleanup',
            `handler/finish/${name}#${method}`, `handler/finish/${name}`, 'handler/finish',
        ];

        let current = 0;
        while (current < steps.length) {
            const step = steps[current];
            let control;
            if (step.startsWith('log/')) h.args[step.slice(4)] = Date.now();
            // eslint-disable-next-line no-await-in-loop
            else if (step.startsWith('handler/')) control = await serial(step, h);
            // eslint-disable-next-line no-await-in-loop
            else if (typeof h[step] === 'function') control = await h[step](args);
            if (control) {
                const index = steps.findIndex((i) => control === i);
                if (index === -1) throw new Error(`Invalid control: ${control}`);
                if (index <= current) {
                    logger.warn('Returning to previous step is not recommended:', step, '->', control);
                }
                current = index;
            } else current++;
        }
    } catch (e) {
        try {
            await serial(`handler/error/${HandlerClass.name.replace(/Handler$/, '')}`, h, e);
            await serial('handler/error', h, e);
            await h.onerror(e);
        } catch (err) {
            h.response.code = 500;
            h.response.body = `${err.message}\n${err.stack}`;
        }
    }
}

const Checker = (permPrivChecker) => {
    let priv: number;
    let checker = () => { };
    for (const item of permPrivChecker) {
        if (typeof item === 'object') {
            if (typeof item.call !== 'undefined') {
                checker = item;
            } else if (typeof item[0] === 'number') {
                priv = item;
            }
        } else if (typeof item === 'number') {
            priv = item;
        }
    }
    return function check(this: Handler) {
        checker();
        if (priv) this.checkPriv(priv);
    };
};

export function Route(name: string, path: string, RouteHandler: any, ...permPrivChecker) {
    router.all(name, path, (ctx) => handle(ctx as any, RouteHandler, Checker(permPrivChecker)));
}

class NotFoundHandler extends Handler {
    prepare() { throw new NotFoundError(this.request.path); }
    all() { }
}

export class RouteService extends Service {
    static readonly methods = ['Route'];
    private registry = {};
    private registrationCount = Counter();

    constructor(ctx) {
        super(ctx, 'server', true);
    }

    // eslint-disable-next-line @typescript-eslint/naming-convention
    public Route(...args: Parameters<typeof Route>) {
        const HandlerClass = args[2];
        const name = HandlerClass.name;
        if (!isClass(HandlerClass)) throw new Error('Invalid registration.');
        if (this.registrationCount[name] && this.registry[name] !== HandlerClass) {
            logger.warn('Route with name %s already exists.', name);
        }
        this.registry[name] = HandlerClass;
        this.registrationCount[name]++;
        Route(...args);
    }
}

declare module '../interface' {
    interface Context {
        server: RouteService;
    }
}

export async function apply(pluginContext: Context) {
    Context.service('server', RouteService);
    pluginContext.server = new RouteService(pluginContext);
    app.keys = [String.random(32)];
    if (process.env.HYDRO_CLI) return;
    const corsAllowHeaders = 'x-requested-with, accept, origin, content-type, upgrade-insecure-requests';
    app.use(async (ctx, next) => {
        if (ctx.request.headers.origin) {
            const host = new URL(ctx.request.headers.origin).host;
            if (host !== ctx.request.headers.host && `,${global.Tools.config.cors || ''},`.includes(`,${host},`)) {
                ctx.set('Access-Control-Allow-Credentials', 'true');
                ctx.set('Access-Control-Allow-Origin', ctx.request.headers.origin);
                ctx.set('Access-Control-Allow-Headers', corsAllowHeaders);
                ctx.set('Vary', 'Origin');
                ctx.cors = true;
            }
        }
        if (ctx.request.method.toLowerCase() === 'options') {
            ctx.body = 'ok';
            return null;
        }
        for (const key in captureAllRoutes) {
            if (ctx.path.startsWith(key)) return captureAllRoutes[key](ctx, next);
        }
        return await next();
    });
    app.use(Compress());
    const dir = resolve(process.cwd(), 'public');
    if (fs.existsSync(dir)) {
        app.use(cache(dir, {
            maxAge: 24 * 3600 * 1000,
        }));
    }
    if (process.env.DEV) {
        app.use(async (ctx: Koa.Context, next: Function) => {
            const startTime = Date.now();
            await next();
            const endTime = Date.now();
            if (ctx.nolog || ctx.response.headers.nolog) return;
            ctx._remoteAddress = ctx.request.ip;
            logger.debug(`${ctx.request.method} /${ctx.domainId || 'system'}${ctx.request.path} \
${ctx.response.status} ${endTime - startTime}ms ${ctx.response.length}`);
        });
    }
    const uploadDir = join(tmpdir(), 'hydro', 'upload', process.env.NODE_APP_INSTANCE || '0');
    fs.ensureDirSync(uploadDir);
    logger.debug('Using upload dir: %s', uploadDir);
    app.use(Body({
        multipart: true,
        jsonLimit: '8mb',
        formLimit: '8mb',
        formidable: {
            uploadDir,
            maxFileSize: 256 * 1024 * 1024,
            keepExtensions: true,
        },
    }));
    pluginContext.on('app/exit', () => {
        fs.emptyDirSync(uploadDir);
    });
    const layers = [baseLayer, responseLayer(router, logger)];
    app.use(router.routes()).use(router.allowedMethods());
    for (const layer of layers) {
        router.use(layer as any);
        app.use(layer);
    }
    app.use((ctx) => handle(ctx, NotFoundHandler, () => true));
    pluginContext.on('app/started', async () => {
        await new Promise((r) => {
            httpServer.listen(argv.options.port || global.Tools.config.port || 8889, () => {
                logger.success('Server listening at: %d', argv.options.port || global.Tools.config.port || 8889);
                r(true);
            });
        });
        pluginContext.on('dispose', () => {
            httpServer.close();
        });
    });
}
