import { Context } from 'cordis';
import superagent from 'superagent';
import { config } from '../config';
import type { BalloonDoc, BalloonNotificationSource } from '../interface';
import { getBalloonName, Logger } from '../utils';

const logger = new Logger('notifier');

interface NotifierClient {
    id: string;
    name: string;
    type: 'webhook';
    subType: keyof typeof Notifier;
    token: string;
    chatId?: string;
    endpoint?: string;
    balloonTemplate?: string;
    report?: boolean;
    enabled?: boolean;
}

interface TextNotifier {
    sendText(text: string): Promise<unknown>;
}

const requestTimeout = { response: 5_000, deadline: 10_000 };

function assertBotResponse(response) {
    const body = response.body || {};
    const code = body.errcode ?? body.code ?? body.StatusCode;
    if (body.ok === false || (code !== undefined && Number(code) !== 0)) {
        throw new Error(`Bot API rejected message: ${JSON.stringify(body)}`);
    }
    return response;
}

class WXWorkNotifier implements TextNotifier {
    constructor(private readonly token: string, private readonly endpoint = 'https://qyapi.weixin.qq.com') { }

    sendText(text: string) {
        return superagent.post(`${this.endpoint.replace(/\/$/, '')}/cgi-bin/webhook/send`)
            .type('json')
            .query({ key: this.token })
            .send({ msgtype: 'text', text: { content: text }, safe: 0 })
            .timeout(requestTimeout)
            .then(assertBotResponse);
    }
}

class TelegramNotifier implements TextNotifier {
    constructor(
        private readonly token: string,
        private readonly endpoint = 'https://api.telegram.org',
        private readonly chatId = '',
    ) { }

    sendText(text: string) {
        return superagent.post(`${this.endpoint.replace(/\/$/, '')}/bot${this.token}/sendMessage`)
            .type('json')
            .send({ chat_id: this.chatId, text })
            .timeout(requestTimeout)
            .then(assertBotResponse);
    }
}

class DingTalkNotifier implements TextNotifier {
    constructor(private readonly token: string, private readonly endpoint = 'https://oapi.dingtalk.com/robot/send') { }

    sendText(text: string) {
        return superagent.post(this.endpoint)
            .type('json')
            .query({ access_token: this.token })
            .send({ msgtype: 'text', text: { content: text } })
            .timeout(requestTimeout)
            .then(assertBotResponse);
    }
}

class LarkNotifier implements TextNotifier {
    constructor(private readonly token: string, private readonly endpoint = '') { }

    sendText(text: string) {
        const target = this.endpoint
            ? this.endpoint.replace('{token}', this.token)
            : `https://open.feishu.cn/open-apis/bot/v2/hook/${this.token}`;
        return superagent.post(target)
            .type('json')
            .send({ msg_type: 'text', content: { text } })
            .timeout(requestTimeout)
            .then(assertBotResponse);
    }
}

class DiscordNotifier implements TextNotifier {
    constructor(
        private readonly token: string,
        private readonly endpoint = 'https://discord.com/api/v10',
        private readonly chatId = '',
    ) { }

    async sendText(text: string) {
        const target = `${this.endpoint.replace(/\/$/, '')}/channels/${this.chatId}/messages`;
        for (let offset = 0; offset < text.length; offset += 2000) {
            // eslint-disable-next-line no-await-in-loop
            await superagent.post(target)
                .set('Authorization', `Bot ${this.token}`)
                .type('json')
                .send({ content: text.slice(offset, offset + 2000) || '\u200b' })
                .timeout(requestTimeout);
        }
    }
}

const Notifier = {
    telegram: TelegramNotifier,
    discord: DiscordNotifier,
    wxwork: WXWorkNotifier,
    dingtalk: DingTalkNotifier,
    lark: LarkNotifier,
};

const DEFAULT_TEMPLATE = `🎈 New balloon
Source: {source}
Balloon: {id}
Team: {team}
Location: {location}
Problem: {problem}
Color: {color}
Award: {award}
Time: {time}`;

function renderMessage(balloonTemplate: string, balloon: BalloonDoc, source: BalloonNotificationSource) {
    const rgb = balloon.contestproblem?.rgb || '';
    const color = balloon.contestproblem?.color || getBalloonName(rgb) || rgb || 'Unknown';
    const values = {
        source: source.name,
        id: balloon.balloonid,
        team: balloon.team,
        location: balloon.location || 'N/A',
        problem: balloon.problem,
        color,
        rgb,
        award: balloon.awards || '',
        time: new Date(Number(balloon.time)).toLocaleString('zh-CN'),
    };
    return (balloonTemplate || DEFAULT_TEMPLATE).replace(/\{(source|id|team|location|problem|color|rgb|award|time)\}/g, (_, key) => values[key]);
}

function createNotifier(client: NotifierClient): TextNotifier {
    const NotifierClass = Notifier[client.subType];
    if (!NotifierClass) throw new Error(`Unknown notifier type: ${client.subType}`);
    return new NotifierClass(client.token, client.endpoint, client.chatId);
}

export async function apply(ctx: Context) {
    const clients = (config.clients || []).filter((client) => client.type === 'webhook') as NotifierClient[];

    const notifiers = new Map<string, { client: NotifierClient; notifier: TextNotifier }>();
    for (const client of clients) {
        if (client.enabled === false) continue;
        try {
            if (!client.id || !client.name || !client.subType || !client.token) throw new Error('Missing notifier fields');
            notifiers.set(client.id, { client, notifier: createNotifier(client) });
            logger.info(`Notifier ${client.subType}(${client.id}) loaded`);
        } catch (error) {
            logger.error(`Failed to load notifier ${client.id || 'unknown'}`, error);
        }
    }

    if (!notifiers.size) {
        await ctx.db.balloon.update({ notifierPending: true }, { $set: { notifierPending: false } }, { multi: true });
        return;
    }

    ctx.on('notifier/balloonTask', async (balloons, source) => {
        if (!notifiers.size) return;
        await Promise.all(balloons.map(async (eventBalloon) => {
            const balloon = await ctx.db.balloon.findOne({ balloonid: eventBalloon.balloonid }) || eventBalloon;
            const notifierSent = source.force ? {} : { ...(balloon.notifierSent || {}) };
            await ctx.db.balloon.updateOne({ balloonid: balloon.balloonid }, {
                $set: {
                    notifierPending: true,
                    notifierSource: source.name,
                    ...(source.force ? { notifierSent: {} } : {}),
                },
            });

            const entries = Array.from(notifiers.entries()).filter(([id]) => !notifierSent[id]);
            const results = await Promise.allSettled(entries.map(async ([id, entry]) => {
                const message = renderMessage(entry.client.balloonTemplate || '', balloon, source);
                await entry.notifier.sendText(message);
                return id;
            }));
            for (const [index, result] of results.entries()) {
                const id = entries[index][0];
                if (result.status === 'fulfilled') {
                    notifierSent[id] = Date.now();
                    logger.info(`Balloon ${balloon.balloonid} sent to notifier ${id}`);
                } else {
                    logger.error(`Failed to send balloon ${balloon.balloonid} to notifier ${id}`, result.reason);
                }
            }

            const shouldReport = !balloon.done && Array.from(notifiers.entries())
                .some(([id, entry]) => entry.client.report && notifierSent[id]);
            let reportComplete = !shouldReport;
            if (shouldReport) {
                try {
                    await ctx.fetcher.setBalloonDone(balloon.balloonid);
                    reportComplete = true;
                    logger.info(`Balloon ${balloon.balloonid} reported done after webhook delivery`);
                } catch (error) {
                    logger.error(`Failed to report balloon ${balloon.balloonid} done`, error);
                }
            }

            const complete = reportComplete && Array.from(notifiers.keys()).every((id) => notifierSent[id]);
            await ctx.db.balloon.updateOne({ balloonid: balloon.balloonid }, {
                $set: { notifierSent, notifierPending: !complete },
            });
        }));
    });
}
