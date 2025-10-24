/* eslint-disable no-await-in-loop */
import path from 'path';
import EscPosEncoder from '@freedom_sky/esc-pos-encoder';
import fs from 'fs-extra';
import superagent from 'superagent';
import { config } from '../config';
import {
    checkReceiptStatus, getBalloonName, Logger, receiptPrint, sleep,
} from '../utils';

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

let template = [
    '#align center',
    '',
    '#bold true',
    '#size 2',
    '#receipt',
    '',
    '#id',
    '',
    '#bold false',
    '#size 1',
    '===============================',
    '',
    '#location',
    '#problem',
    '#color',
    '#comment',
    '',
    '#align center',
    '#bold true',
    '===============================',
    '',
    '#size 0',
    '#team',
    '#status',
    '#time',
];
try {
    template = fs.readFileSync(path.resolve(process.cwd(), 'balloon.template'), 'utf8').split('\n').map((i) => i.trim());
} catch (e) {
    logger.info('Using builtin balloon template');
}

export const receiptBalloonText = (
    id: number, location: string, problem: string, color: string, comment: string, teamname: string, status: string, lang: 'zh' | 'en' = 'zh',
) => {
    let enc = encoder.initialize().codepage('cp936').setPinterType(config.balloonType ?? 80);
    const commands = {
        align: (align: 'center' | 'left' | 'right') => enc.align(align),
        emptyLine: (lines: number) => enc.emptyLine(lines),
        bold: (bold: boolean) => enc.bold(bold),
        size: (size: number) => enc.size(size),
        line: (line: string) => enc.line(line),
        oneLine: (left: string, right: string) => enc.oneLine(left, right),
        cut: () => enc.cut(),
        id: () => enc.line(`ID: ${String(id).substring(0, 8)}`),
        location: () => enc.oneLine(i18n[lang].location, location),
        problem: () => enc.oneLine(i18n[lang].problem, problem),
        color: () => enc.oneLine(i18n[lang].color, color),
        comment: () => enc.oneLine(i18n[lang].comment, comment),
        team: () => enc.line(`${i18n[lang].team}: ${teamname}`),
        status: () => enc.line(`${i18n[lang].status}:\n${status}`),
        time: () => enc.line(`Time: ${new Date().toLocaleString()}`),
    };
    for (const line of template) {
        if (!line.startsWith('#')) enc = enc.line(line);
        const [command, ...rawArgs] = line.slice(1).split(' ');
        const args = rawArgs.map((arg) => (arg === 'true' ? true : arg === 'false' ? false : Number.isSafeInteger(arg) ? +arg : arg));
        if (commands[command]) enc = commands[command](...args);
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
`;

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
