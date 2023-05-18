import { Logger } from '@hydrooj/utils';
import superagent from 'superagent';
const logger = new Logger('client/http');

export default class BasicFetcher {
    cookie: string[] = [];
    server: string;

    constructor(
        public config: { server: string, uname: string, password: string },
    ) {
        this.server = config.server;
        if (!this.server.endsWith('/')) this.server += '/';
        this.login(config);
        return this;
    }

    get(url: string) {
        logger.debug('get', url);
        url = new URL(url, this.server).toString();
        let req = superagent.get(url).set('Cookie', this.cookie);
        return req;
    }

    post(url: string) {
        logger.debug('post', url, this.cookie);
        url = new URL(url, this.server).toString();
        let req = superagent.post(url).set('Cookie', this.cookie);
        return req;
    }

    setCookie(cookie: string | string[]) {
        if (typeof cookie === 'string') this.cookie = [cookie];
        else this.cookie = cookie;
    }

    async login(config) {
        const res = await this.post('/login').type('json').send({ 
            uname: config.uname,
            password: config.password,
        });
        if (!res.body.error) {
            this.setCookie(res.headers['set-cookie']);
            logger.info('Login success');
        }
    }
}
