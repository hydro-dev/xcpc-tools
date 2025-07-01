/* eslint-disable no-await-in-loop */
import EscPosEncoder from '@freedom_sky/esc-pos-encoder';
import superagent from 'superagent';
import { config } from '../config';
import {
    checkReceiptStatus, getBalloonName, Logger, receiptPrint, sleep,
} from '../utils';

const post = (url: string) => superagent.post(new URL(url, config.server).toString()).set('Accept', 'application/json');
const encoder = new EscPosEncoder();

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
) => encoder
    .initialize()
    .codepage('cp936')
    .setPinterType(config.balloonType ?? 80) // wrong typo in the library
    .align('center')
    .line('')
    .bold(true)
    .size(2)
    .line(i18n[lang].receipt)
    .emptyLine(1)
    .line(`ID: ${String(id).substring(0, 8)}`)
    .emptyLine(1)
    .bold(false)
    .size(1)
    .line('===============================')
    .emptyLine(1)
    .oneLine(i18n[lang].location, location)
    .oneLine(i18n[lang].problem, problem)
    .oneLine(i18n[lang].color, color)
    .oneLine(i18n[lang].comment, comment)
    .emptyLine(1)
    .align('center')
    .bold(true)
    .line('================================')
    .emptyLine(1)
    .size(0)
    .line(`${i18n[lang].team}: ${teamname}`)
    .line(`${i18n[lang].status}:`)
    .line(`${status}`)
    .emptyLine(1)
    .line('Powered by hydro-dev/xcpc-tools')
    .emptyLine(2)
    .cut()
    .encode();

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
`;

const logger = new Logger('balloon');

let timer = null;
let printer = null;

async function printBalloon(doc, lang) {
    let status = '';
    for (const i in doc.total) {
        status += `- ${i}: ${getBalloonName(doc.total[i].color, lang)}\n`;
    }
    const genText = config.balloonType === 'plain' ? plainBalloonText : receiptBalloonText;
    const bReceipt = await genText(
        doc.balloonid,
        doc.location ? doc.location : 'N/A',
        doc.problem,
        getBalloonName(doc.contestproblem.rgb, lang),
        doc.awards ? doc.awards : 'N/A',
        doc.team,
        status,
        lang,
    );
    printer = await checkReceiptStatus(printer);
    await receiptPrint(printer, bReceipt, config.balloonCommand);
}

async function fetchTask(c) {
    if (timer) clearTimeout(timer);
    logger.info('Fetching balloon task from tools server...');
    try {
        const { body } = await post(`${c.server}client/${c.token}/balloon`).send();
        if (body.balloons) {
            for (const doc of body.balloons) {
                logger.info(`Print balloon task ${doc.teamid}#${doc.balloonid}...`);
                await printBalloon(doc, config.balloonLang);
                await post(`${c.server}client/${c.token}/doneballoon/${doc.balloonid}`);
                logger.info(`Print task ${doc.teamid}#${doc.balloonid} completed.`);
            }
        } else {
            logger.info('No balloon task, sleeping...');
            await sleep(5000);
        }
    } catch (e) {
        logger.error(e);
        await sleep(5000);
    }
    timer = setTimeout(() => fetchTask(c), 3000);
}

export async function apply() {
    printer = { printer: config.balloon };
    if (config.token && config.server && config.balloon) await fetchTask(config);
    else logger.error('Config not found, please check the config.yaml');
}
