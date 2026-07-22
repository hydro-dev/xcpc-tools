/* eslint-disable no-await-in-loop */
import EscPosEncoder from '@freedom_sky/esc-pos-encoder';
import superagent from 'superagent';
import { config } from '../config';
import {
    getBalloonName, Logger, receiptPrint, sleep,
} from '../utils';
import { setClientConnection, updateClientTask } from './status';

const post = (url: string) => superagent.post(new URL(url, config.server).toString()).set('Accept', 'application/json');
const encoder = new EscPosEncoder();
const logger = new Logger('balloon');

const i18n = {
    zh: {
        receipt: '气球打印单',
        location: '座位',
        problem: '题目',
        color: '颜色',
        comment: '备注',
        team: '队伍',
        status: '队伍当前气球状态',
    },
    en: {
        receipt: 'Balloon Receipt',
        location: 'Location',
        problem: 'Balloon',
        color: 'Color',
        comment: 'Comment',
        team: 'Team',
        status: 'Team Balloon Status',
    },
};

export const receiptBalloonText = (
    id: number, location: string, problem: string, color: string, comment: string, teamname: string, status: string, lang: 'zh' | 'en' = 'zh',
) => {
    let enc = encoder.initialize().codepage('cp936').setPinterType(config.balloonType ?? 80);
    const whitelist = [
        'align', 'barcode', 'bold', 'cut', 'curPartial',
        'emptyLine', 'image', 'italic', 'line', 'newLine',
        'oneLine', 'qrcode', 'size', 'text', 'underline',
    ];
    const replace = (input: string) => input
        .replace(/\{id\}/g, String(id).substring(0, 8))
        .replace(/\{location\}/g, location)
        .replace(/\{problem\}/g, problem)
        .replace(/\{color\}/g, color)
        .replace(/\{comment\}/g, comment)
        .replace(/\{team\}/g, teamname)
        .replace(/\{status\}/g, status)
        .replace(/\{time\}/g, new Date().toLocaleString())
        .replace(/%LOCATION/g, i18n[lang].location)
        .replace(/%PROBLEM/g, i18n[lang].problem)
        .replace(/%COLOR/g, i18n[lang].color)
        .replace(/%COMMENT/g, i18n[lang].comment)
        .replace(/%TEAM/g, i18n[lang].team)
        .replace(/%STATUS/g, i18n[lang].status)
        .replace(/%RECEIPT/g, i18n[lang].receipt);
    for (const line of config.balloonTemplate.replace(/\r/g, '').split('\n')) {
        if (!line.startsWith('#')) {
            enc = enc.line(replace(line));
            continue;
        }
        const [command, ...rawArgs] = line.slice(1).split(' ');
        const args = rawArgs.map((arg) => (arg === 'true' ? true : arg === 'false' ? false : Number.isSafeInteger(arg) ? +arg : replace(arg)));
        if (whitelist.includes(command)) enc = enc[command](...args);
        else logger.warn(`Unsupported printer command: ${command}`);
    }
    return enc
        .line('Powered by hydro-dev/xcpc-tools')
        .emptyLine(1)
        .cut()
        .encode();
};

export const plainBalloonText = (
    id: number, location: string, problem: string, color: string, comment: string, teamname: string, status: string, lang: 'zh' | 'en' = 'zh',
) => `
${i18n[lang].receipt}
ID: ${id}
${i18n[lang].location}: ${location}
${i18n[lang].team}: ${teamname}
${i18n[lang].problem}: ${problem}
${i18n[lang].color}: ${color}
${i18n[lang].comment}: ${comment}
Powered by hydro-dev/xcpc-tools
`;

let timer = null;
let printer: string = null;

function startBalloonLeaseHeartbeat(c, doc) {
    const heartbeatTimer = setInterval(async () => {
        try {
            await post(`${c.server}client/${c.token}/leaseballoon/${doc.balloonid}`);
            setClientConnection('balloon', true);
        } catch (error) {
            setClientConnection('balloon', false, error);
            logger.warn(`Failed to renew balloon task lease ${doc.teamid}#${doc.balloonid}`);
        }
    }, 10_000);
    return () => clearInterval(heartbeatTimer);
}

async function printBalloon(doc, lang) {
    let status = '';
    for (const i in doc.total) {
        status += `- ${i}: ${doc.total[i].color || getBalloonName(doc.total[i].rgb, lang)}\n`;
    }
    const genText = config.balloonType === 'plain' ? plainBalloonText : receiptBalloonText;
    const bReceipt = await genText(
        doc.balloonid,
        doc.location ? doc.location : 'N/A',
        doc.problem,
        doc.contestproblem.color || getBalloonName(doc.contestproblem.rgb, lang),
        doc.awards ? doc.awards : 'N/A',
        doc.team,
        status,
        lang,
    );
    await receiptPrint(printer, bReceipt, config.balloonCommand);
}

async function fetchTask(c) {
    if (timer) clearTimeout(timer);
    logger.info('Fetching balloon task from tools server...');
    try {
        const { body } = await post(`${c.server}client/${c.token}/balloon`);
        setClientConnection('balloon', true);
        if (body.balloons?.length) {
            for (const doc of body.balloons) {
                logger.info(`Print balloon task ${doc.teamid}#${doc.balloonid}...`);
                const label = `${doc.location || 'Unknown seat'} · ${doc.problem || doc.balloonid}`;
                const stopLeaseHeartbeat = startBalloonLeaseHeartbeat(c, doc);
                updateClientTask('balloon', doc.balloonid, label, 'received', { printer });
                try {
                    updateClientTask('balloon', doc.balloonid, label, 'printing', { printer });
                    await printBalloon(doc, config.balloonLang);
                } catch (error) {
                    stopLeaseHeartbeat();
                    updateClientTask('balloon', doc.balloonid, label, 'failed', { printer, error });
                    throw error;
                }
                updateClientTask('balloon', doc.balloonid, label, 'confirming', { printer });
                let confirmed = false;
                let rejected = false;
                while (!confirmed) {
                    try {
                        await post(`${c.server}client/${c.token}/doneballoon/${doc.balloonid}`);
                        setClientConnection('balloon', true);
                        confirmed = true;
                    } catch (error) {
                        const status = Number((error as any)?.status);
                        if (status === 400 || status === 404) {
                            setClientConnection('balloon', true);
                            updateClientTask('balloon', doc.balloonid, label, 'failed', { printer, error });
                            logger.error(`Server rejected balloon completion for ${doc.teamid}#${doc.balloonid}; the task has expired or changed.`, error);
                            rejected = true;
                            break;
                        }
                        setClientConnection('balloon', false, error);
                        logger.error(`Failed to confirm balloon task ${doc.teamid}#${doc.balloonid}, retrying...`, error);
                        await sleep(3000);
                    }
                }
                stopLeaseHeartbeat();
                if (rejected) continue;
                updateClientTask('balloon', doc.balloonid, label, 'done', { printer });
                logger.info(`Print task ${doc.teamid}#${doc.balloonid} completed.`);
            }
        } else {
            logger.info('No balloon task, sleeping...');
            await sleep(5000);
        }
    } catch (e) {
        setClientConnection('balloon', false, e);
        logger.error(e);
        await sleep(5000);
    }
    timer = setTimeout(() => fetchTask(c), 3000);
}

export async function apply() {
    printer = config.balloon;
    if (config.token && config.server && config.balloon) await fetchTask(config);
    else logger.error('Config not found, please check the config.yaml');
}
