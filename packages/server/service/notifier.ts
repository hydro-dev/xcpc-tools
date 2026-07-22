import { Context } from 'cordis';
import superagent from 'superagent';
import { config } from '../config';
import type { BalloonDoc, BalloonNotificationSource } from '../interface';
import { getBalloonName, Logger, sleep } from '../utils';

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

export interface NotifierStatus {
    id: string;
    name: string;
    subType: string;
    enabled: boolean;
    loaded: boolean;
    lastAttemptAt: number;
    lastSuccessAt: number;
    lastError: string;
}

interface TextNotifier {
    sendText(text: string): Promise<unknown>;
}

const requestTimeout = { response: 5_000, deadline: 10_000 };
const notifierStatuses = new Map<string, NotifierStatus>();

function sanitizeNotifierError(error: unknown, client: NotifierClient) {
    let message = error instanceof Error ? error.message : String(error ?? 'Unknown notifier error');
    for (const secret of [client.token, client.chatId, client.endpoint]) {
        if (secret) message = message.split(secret).join('[redacted]');
    }
    return message
        .replace(/https?:\/\/[^\s"'<>]+/gi, '[redacted-url]')
        .replace(/([?&](?:token|key|secret|password|access_token)=)[^&\s]+/gi, '$1[redacted]')
        .slice(0, 500);
}

function setConfiguredNotifierStatus(client: NotifierClient) {
    const { id } = client;
    notifierStatuses.set(id, {
        id,
        name: String(client.name || id),
        subType: String(client.subType || 'unknown'),
        enabled: client.enabled !== false,
        loaded: false,
        lastAttemptAt: 0,
        lastSuccessAt: 0,
        lastError: '',
    });
}

export function getNotifierStatuses(): NotifierStatus[] {
    return Array.from(notifierStatuses.values())
        .map((status) => ({ ...status }))
        .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

function updateNotifierStatus(id: string, values: Partial<NotifierStatus>) {
    const status = notifierStatuses.get(id);
    if (status) Object.assign(status, values);
}

function isNetworkError(error: any) {
    return !error?.status && !error?.response && Boolean(error?.code || error?.errno || error?.timeout);
}

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
    const enabledNotifierIds = clients.filter((client) => client.enabled !== false).map((client) => client.id);
    notifierStatuses.clear();
    for (const client of clients) setConfiguredNotifierStatus(client);

    const notifiers = new Map<string, { client: NotifierClient; notifier: TextNotifier }>();
    for (const client of clients) {
        if (client.enabled === false) continue;
        try {
            if (!client.id || !client.name || !client.subType || !client.token) throw new Error('Missing notifier fields');
            notifiers.set(client.id, { client, notifier: createNotifier(client) });
            updateNotifierStatus(client.id, { loaded: true });
            logger.info(`Notifier ${client.subType}(${client.id}) loaded`);
        } catch (error) {
            updateNotifierStatus(client.id, { lastError: sanitizeNotifierError(error, client) });
            logger.error(`Failed to load notifier ${client.id || 'unknown'}`, error);
        }
    }

    if (!enabledNotifierIds.length) {
        await ctx.db.balloon.update(
            { notifierPending: true },
            { $set: { notifierPending: false, notifierFailed: false } },
            { multi: true },
        );
        return;
    }

    const deliveries = new Map<string, Promise<void>>();
    const deliver = async (eventBalloon: BalloonDoc, source: BalloonNotificationSource) => {
        const balloon = await ctx.db.balloon.findOne({ balloonid: eventBalloon.balloonid }) || eventBalloon;
        if (balloon.notifierFailed && !source.force && !source.retryFailed) return;

        const notifierSent = source.force ? {} : { ...(balloon.notifierSent || {}) };
        await ctx.db.balloon.updateOne({ balloonid: balloon.balloonid }, {
            $set: {
                notifierPending: true,
                notifierFailed: false,
                notifierSource: source.name,
                ...(source.force ? { notifierSent: {} } : {}),
            },
        });

        const entries = Array.from(notifiers.entries()).filter(([id]) => !notifierSent[id]);
        const results = await Promise.allSettled(entries.map(async ([id, entry]) => {
            updateNotifierStatus(id, { lastAttemptAt: Date.now() });
            const message = renderMessage(entry.client.balloonTemplate || '', balloon, source);
            try {
                try {
                    await entry.notifier.sendText(message);
                } catch (error) {
                    if (!isNetworkError(error)) throw error;
                    await sleep(5_000);
                    updateNotifierStatus(id, { lastAttemptAt: Date.now() });
                    await entry.notifier.sendText(message);
                }
                updateNotifierStatus(id, { lastSuccessAt: Date.now(), lastError: '' });
            } catch (error) {
                updateNotifierStatus(id, { lastError: sanitizeNotifierError(error, entry.client) });
                throw error;
            }
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

        const deliveryFailed = results.some((result) => result.status === 'rejected')
            || enabledNotifierIds.some((id) => !notifiers.has(id));
        const complete = reportComplete && enabledNotifierIds.every((id) => notifierSent[id]);
        await ctx.db.balloon.updateOne({ balloonid: balloon.balloonid }, {
            $set: {
                notifierSent,
                notifierPending: !deliveryFailed && !complete,
                notifierFailed: deliveryFailed,
            },
        });
    };

    ctx.on('notifier/balloonTask', async (balloons, source) => {
        await Promise.all(balloons.map((balloon) => {
            const current = deliveries.get(balloon.balloonid);
            if (current) return current;
            const delivery = deliver(balloon, source).finally(() => {
                if (deliveries.get(balloon.balloonid) === delivery) deliveries.delete(balloon.balloonid);
            });
            deliveries.set(balloon.balloonid, delivery);
            return delivery;
        }));
    });

    const interrupted = await ctx.db.balloon.find({ notifierPending: true });
    if (interrupted.length) {
        logger.info(`Retrying ${interrupted.length} interrupted notifier deliveries`);
        await ctx.parallel('notifier/balloonTask', interrupted, { name: 'Server restart' });
    }
}
