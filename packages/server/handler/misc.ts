/* eslint-disable no-await-in-loop */
// @ts-ignore
import StaticFrontend from '../data/static.frontend';
import { Context } from '../interface';
import { Handler } from '../service/server';
import { StaticHTML } from '../utils';

class StaticHandler extends Handler {
    async get() {
        this.response.addHeader('Cache-Control', 'public');
        this.response.addHeader('Expires', new Date(new Date().getTime() + 86400000).toUTCString());
        this.response.type = 'text/javascript';
        this.binary(Buffer.from(StaticFrontend, 'base64'), 'main.js');
    }
}

export class AuthHandler extends Handler {
    async prepare() {
        if (!this.request.headers.authorization) {
            this.response.status = 401;
            this.response.addHeader('WWW-Authenticate', 'Basic realm="XCPC Tools"');
            this.response.body = 'Authentication required';
            return 'cleanup';
        }
        const [uname, pass] = Buffer.from(this.request.headers.authorization.split(' ')[1], 'base64').toString().split(':');
        if (uname !== 'admin' || pass !== global.Tools.config.viewPassword.toString()) {
            this.response.status = 401;
            this.response.addHeader('WWW-Authenticate', 'Basic realm="XCPC Tools"');
            this.response.body = 'Authentication failed';
            return 'cleanup';
        }
        return '';
    }
}

class HomeHandler extends AuthHandler {
    async get() {
        const context = {
            secretRoute: global.Tools.config.secretRoute,
            contest: global.Tools.contest || { name: 'Server Mode' },
        };
        if (this.request.headers.accept === 'application/json') {
            this.response.body = context;
        } else {
            this.response.type = 'text/html';
            this.response.body = StaticHTML(context);
        }
    }
}

export async function apply(ctx: Context) {
    ctx.Route('home', '/', HomeHandler);
    ctx.Route('static', '/main.js', StaticHandler);
}
