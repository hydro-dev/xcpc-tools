/* eslint-disable no-await-in-loop */
import EscPosEncoder from '@freedom_sky/esc-pos-encoder';
import superagent from 'superagent';
import { config } from '../config';
import {
    checkReceiptStatus, convertToChinese, Logger, receiptPrint, sleep,
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

export const receiptText = (
    id: number, location: string, problem: string, color: string, comment: string, teamname: string, status: string, lang: 'zh' | 'en' = 'zh',
) => encoder
    .initialize()
    .codepage('cp936')
    .setPinterType(80) // wrong typo in the library
    .align('center')
    .bold(true)
    .size(2)
    .line(i18n[lang].receipt)
    .emptyLine(1)
    .line(`ID: ${id}`)
    .emptyLine(1)
    .bold(false)
    .size(1)
    .line('===========================================')
    .emptyLine(1)
    .oneLine(i18n[lang].location, location)
    .oneLine(i18n[lang].problem, problem)
    .oneLine(i18n[lang].color, color)
    .oneLine(i18n[lang].comment, comment)
    .emptyLine(1)
    .align('center')
    .bold(true)
    .line('===========================================')
    .emptyLine(2)
    .size(0)
    .line(`${i18n[lang].team}: ${teamname}`)
    .line(`${i18n[lang].status}:`)
    .line(`${status}`)
    .emptyLine(2)
    .line('Powered by hydro-dev/xcpc-tools')
    .emptyLine(3)
    .cut()
    .encode();

const logger = new Logger('balloon');

let timer = null;
let printer = null;

async function printBalloon(doc, lang) {
    const bReceipt = receiptText(
        doc.balloonid,
        doc.location ? doc.location : 'N/A',
        doc.problem,
        lang === 'zh' ? convertToChinese(doc.contestproblem.color) : doc.contestproblem.color,
        doc.awards ? doc.awards : 'N/A',
        doc.team,
        doc.total ? Object.keys(doc.total).map((k) => `- ${k}: ${doc.total[k].color}`).join('\n') : 'N/A',
        lang,
    );
    printer = await checkReceiptStatus(printer);
    await receiptPrint(printer, bReceipt);
}

async function fetchTask(c) {
    if (timer) clearTimeout(timer);
    logger.info('Fetching balloon task from tools server...');
    try {
        const { body } = await post(`${c.server}/client/${c.token}/balloon`).send();
        if (body.balloons) {
            for (const doc of body.balloons) {
                logger.info(`Print balloon task ${doc.teamid}#${doc.balloonid}...`);
                await printBalloon(doc, config.receiptLang);
                await post(`${c.server}/client/${c.token}/doneballoon/${doc.balloonid}`);
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
