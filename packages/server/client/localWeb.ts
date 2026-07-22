import net from 'node:net';
import { Context } from 'cordis';
import { Handler, WebService } from '@hydrooj/framework';
import { config } from '../config';
// @ts-ignore
import StaticFrontend from '../data/static.frontend';
import {
    decodeBinary, Logger, randomstring, StaticHTML,
} from '../utils';
import { getClientStatus, initializeClientStatus } from './status';

const frontend = decodeBinary(StaticFrontend, 'static.frontend');
const frontendHash = randomstring(8).toLowerCase();
const logger = new Logger('client/local-web');

interface LocalWebParams {
    host?: string;
    port?: number;
}

const checkPortAvailable = (host: string, port: number) => new Promise<void>((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.once('error', reject);
    probe.listen(port, host, () => probe.close(() => resolve()));
});

class ClientHomeHandler extends Handler {
    async get() {
        this.response.addHeader('Cache-Control', 'no-store');
        this.response.addHeader('Content-Security-Policy', "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'");
        this.response.type = 'text/html';
        this.response.body = StaticHTML({ clientMode: true }, frontendHash);
    }
}

class ClientFrontendHandler extends Handler {
    async get() {
        this.response.addHeader('Cache-Control', 'public, max-age=86400');
        this.response.type = 'text/javascript';
        this.binary(frontend, 'main.js');
    }
}

class ClientStatusHandler extends Handler {
    async get() {
        this.response.addHeader('Cache-Control', 'no-store');
        this.response.body = getClientStatus();
    }
}

class ClientPageHandler extends Handler {
    async get() {
        this.response.redirect = `/#${this.request.path}`;
    }
}

export async function apply(pluginContext: Context, params: LocalWebParams = {}) {
    const host = params.host || '127.0.0.1';
    const port = params.port || 5284;
    try {
        await checkPortAvailable(host, port);
    } catch (error) {
        logger.error(`Local Web cannot listen on ${host}:${port}`, error);
        process.exit(1);
    }
    pluginContext.plugin(WebService, {
        host,
        port,
        keys: [randomstring(16)],
        upload: undefined,
        enableSSE: false,
    } as any);

    const services: Array<'print' | 'balloon'> = [];
    if ((config as any).printers?.length) services.push('print');
    if ((config as any).balloon) services.push('balloon');
    initializeClientStatus((config as any).server, (config as any).token, services);
    await pluginContext.inject(['server'], async (ctx) => {
        ctx.Route('client_home', '/', ClientHomeHandler);
        ctx.Route('client_frontend', '/main.js', ClientFrontendHandler);
        ctx.Route('client_status', '/api/status', ClientStatusHandler);
        ctx.Route('client_print', '/print', ClientPageHandler);
        ctx.Route('client_balloon', '/balloon', ClientPageHandler);
        await ctx.server.listen();
    });
}
