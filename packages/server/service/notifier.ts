import { Context } from 'cordis';
import superagent from 'superagent';
import { Logger } from '../utils';

const logger = new Logger('notifier');

class WXWorkNotifier {
    private readonly token: string;
    private readonly endpoint: string;

    constructor(key: string, endpoint = '') {
        this.token = key;
        this.endpoint = endpoint || 'https://qyapi.weixin.qq.com/';
    }

    async sendText(text: string) {
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
        return await superagent.post(`${this.endpoint}/cgi-bin/webhook/send`)
            .type('json')
            .query({ key: this.token })
            .send(data);
    }
}

class TelegramNotifier {
    private readonly token: string;
    private readonly chatId: string;
    private readonly endpoint: string;

    constructor(token: string, endpoint = '', chatId = '') {
        this.token = token;
        this.chatId = chatId;
        this.endpoint = endpoint || 'https://api.telegram.org';
    }

    async sendText(text: string) {
        return await superagent.post(`${this.endpoint}/bot${this.token}/sendMessage`)
            .type('json')
            .send({
                chat_id: this.chatId,
                text,
            });
    }

    async sendCustom(data: any) {
        return await superagent.post(`${this.endpoint}/bot${this.token}/sendMessage`)
            .type('json')
            .send(data);
    }
}

class DingTalkNotifier {
    private readonly token: string;
    private readonly endpoint: string;

    constructor(token: string, endpoint = '') {
        this.token = token;
        this.endpoint = endpoint || 'https://oapi.dingtalk.com/robot/send';
    }

    async sendText(text: string) {
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
        return await superagent.post(this.endpoint)
            .type('json')
            .query({ access_token: this.token })
            .send(data);
    }
}

class LarkNotifier {
    private readonly token: string;
    private readonly endpoint: string;

    constructor(token: string, endpoint = '') {
        this.token = token;
        this.endpoint = endpoint || 'https://open.feishu.cn/open-apis/bot/v2/hook';
    }

    async sendText(text: string) {
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

const notifiers = {};

export async function apply(ctx: Context) {
    const clients = await ctx.db.client.find({ type: 'webhook' });
    for (const client of clients) {
        const {
            _id, subType, token, chatId, endpoint,
        } = client;
        const notifierInstance = new Notifier[subType](token, endpoint, chatId);
        logger.info(`Notifier ${subType}(${_id}) loaded`);
        notifiers[_id] = notifierInstance;
    }
}
