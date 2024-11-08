import { Context, Service } from 'cordis';
import superagent from 'superagent';
import { Logger } from '../utils';

const logger = new Logger('notifier');

declare module 'cordis' {
    interface Context {
        notifyservice: NotifyService;
        notifier: Record<string, Notifier>;
    }
}

interface Notifier {
    sendText(text: string): Promise<superagent.Response>;
    sendCustom(data: any): Promise<superagent.Response>;
}

class WXWorkNotifier implements Notifier {
    private readonly token: string;
    private readonly endpoint: string;

    constructor(key: string, endpoint = '') {
        this.token = key;
        this.endpoint = endpoint || 'https://qyapi.weixin.qq.com/';
    }

    async sendText(text: string) {
        logger.info(`Sending text to wxwork: ${text}`);
        return await superagent.post(`${this.endpoint}/cgi-bin/webhook/send`)
            .type('json')
            .query({ key: this.token })
            .send({
                msgtype: 'text',
                text: {
                    content: text,
                },
                safe: 0,
            });
    }

    async sendCustom(data: any) {
        logger.info(`Sending custom to wxwork: ${JSON.stringify(data)}`);
        return await superagent.post(`${this.endpoint}/cgi-bin/webhook/send`)
            .type('json')
            .query({ key: this.token })
            .send(data);
    }
}

class TelegramNotifier implements Notifier {
    private readonly token: string;
    private readonly chatId: string;
    private readonly endpoint: string;

    constructor(token: string, endpoint = '', chatId = '') {
        this.token = token;
        this.chatId = chatId;
        this.endpoint = endpoint || 'https://api.telegram.org';
    }

    async sendText(text: string) {
        logger.info(`Sending text to telegram: ${text}`);
        return await superagent.post(`${this.endpoint}/bot${this.token}/sendMessage`)
            .type('json')
            .send({
                chat_id: this.chatId,
                text,
            });
    }

    async sendCustom(data: any) {
        logger.info(`Sending custom to telegram: ${JSON.stringify(data)}`);
        return await superagent.post(`${this.endpoint}/bot${this.token}/sendMessage`)
            .type('json')
            .send(data);
    }
}

class DingTalkNotifier implements Notifier {
    private readonly token: string;
    private readonly endpoint: string;

    constructor(token: string, endpoint = '') {
        this.token = token;
        this.endpoint = endpoint || 'https://oapi.dingtalk.com/robot/send';
    }

    async sendText(text: string) {
        logger.info(`Sending text to dingtalk: ${text}`);
        return await superagent.post(this.endpoint)
            .type('json')
            .query({ access_token: this.token })
            .send({
                msgtype: 'text',
                text: {
                    content: text,
                },
            });
    }

    async sendCustom(data: any) {
        logger.info(`Sending custom to dingtalk: ${JSON.stringify(data)}`);
        return await superagent.post(this.endpoint)
            .type('json')
            .query({ access_token: this.token })
            .send(data);
    }
}

class LarkNotifier implements Notifier {
    private readonly token: string;
    private readonly endpoint: string;

    constructor(token: string, endpoint = '') {
        this.token = token;
        this.endpoint = endpoint || 'https://open.feishu.cn/open-apis/bot/v2/hook';
    }

    async sendText(text: string) {
        logger.info(`Sending text to lark: ${text}`);
        return await superagent.post(this.endpoint)
            .type('json')
            .query({ app_id: this.token })
            .send({
                msg_type: 'text',
                content: {
                    text,
                },
            });
    }

    async sendCustom(data: any) {
        logger.info(`Sending custom to lark: ${JSON.stringify(data)}`);
        return await superagent.post(this.endpoint)
            .type('json')
            .query({ app_id: this.token })
            .send(data);
    }
}

const Notifier = {
    wxwork: WXWorkNotifier,
    telegram: TelegramNotifier,
    dingtalk: DingTalkNotifier,
    lark: LarkNotifier,
};

class NotifyService extends Service {
    constructor(ctx: Context) {
        super(ctx, 'notifyservice', true);
        ctx.mixin('notifyservice', ['notifier']);
        this.start();
    }

    notifier: Record<string, Notifier> = {};

    async addNotifier(id: string, subType: keyof typeof Notifier, token: string, endpoint = '', chatId = '') {
        this.notifier[id] = new Notifier[subType](token, endpoint, chatId);
        this.ctx.logger('notifier').info(`Notifier ${subType}(${id}) loaded`);
    }
}

export async function apply(ctx: Context) {
    ctx.provide('notifier', undefined, true);
    ctx.notifyservice = new NotifyService(ctx);
    const clients = await ctx.db.client.find({ type: 'webhook' });
    for (const client of clients) {
        const {
            _id, subType, token, chatId, endpoint,
        } = client;
        ctx.notifyservice.addNotifier(_id, subType as keyof typeof Notifier, token, endpoint, chatId);
    }
}
