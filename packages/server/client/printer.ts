/* eslint-disable no-await-in-loop */
import path from 'path';
import superagent from 'superagent';
import { config, saveConfig } from '../config';
import {
    fs, getPrinters, initWinPrinter, Logger, print, sleep,
} from '../utils';
import { createTypstCompiler, generateTypst } from './typst';

let compiler;

const logger = new Logger('printer');

let timer = null;

export async function ConvertCodeToPDF(code, lang, filename, team, location) {
    compiler ||= await createTypstCompiler();
    const typst = generateTypst(team, location, filename, lang);
    compiler.addSource(path.resolve(process.cwd(), 'main.typst'), typst);
    compiler.addSource(path.resolve(process.cwd(), filename), code);
    const docs = await compiler.compile({
        format: 'pdf',
        mainFilePath: path.resolve(process.cwd(), 'main.typst'),
    });
    logger.info(`Convert ${filename} to PDF`);
    return docs;
}

export async function printFile(doc) {
    const {
        _id, tid, code, lang, filename, team, location,
    } = doc;
    try {
        const docs = await ConvertCodeToPDF(code || 'empty file', lang, filename, team, location);
        fs.writeFileSync(path.resolve(process.cwd(), `data/${tid}#${_id}.pdf`), docs);
        if (config.printers.length) {
            // eslint-disable-next-line no-constant-condition
            while (true) {
                const printersInfo = await getPrinters();
                const printers = printersInfo.filter((p) => config.printers.includes(p.printer));
                const randomP = printers[Math.floor(Math.random() * printers.length)];
                if (randomP.status === 'idle') {
                    logger.info(`Printing ${_id} on ${randomP.printer}`);
                    await print(path.resolve(process.cwd(), `data/${tid}#${_id}.pdf`), randomP.printer, 1, 5);
                    return;
                }
                for (const printer of printers.filter((p) => p.printer !== randomP.printer)) {
                    logger.info(`Checking ${printer.printer} ${printer.status}`);
                    if (printer.status === 'idle') {
                        logger.info(`Printing ${_id} on ${printer.printer}`);
                        await print(path.resolve(process.cwd(), `data/${tid}#${_id}.pdf`), printer.printer, 1, 5);
                        return;
                    }
                }
                logger.info('No Printer can found to print, sleeping...');
                await sleep(3000);
            }
        }
    } catch (e) {
        logger.error(e);
    }
}

async function fetchTask(c) {
    if (timer) clearTimeout(timer);
    logger.info('Fetching Task from tools server...');
    try {
        const printersInfo = await getPrinters();
        const { body } = await superagent.post(`${c.server}/client/${c.token}/print`)
            .send({
                printers: config.printers,
                printersInfo: JSON.stringify(printersInfo.map((p) => ({
                    printer: p.printer,
                    status: p.status,
                    description: p.description,
                }))),
            });
        if (body.setPrinter) {
            config.printers = body.setPrinter;
            saveConfig();
            logger.info(`Printer set to ${config.printers}`);
        }
        if (body.doc) {
            logger.info(`Print task ${body.doc.tid}#${body.doc._id}...`);
            await printFile(body.doc);
            await superagent.post(`${c.server}/client/${c.token}/doneprint/${body.doc._id}`);
            logger.info(`Print task ${body.doc.tid}#${body.doc._id} completed.`);
        } else {
            logger.info('No print task, sleeping...');
            await sleep(5000);
        }
    } catch (e) {
        logger.error(e);
        await sleep(5000);
    }
    timer = setTimeout(() => fetchTask(c), 3000);
}

export async function apply() {
    compiler = await createTypstCompiler();
    if (process.platform === 'win32') {
        try {
            initWinPrinter();
        } catch (e) {
            logger.error(e);
            process.exit(1);
        }
    }
    if (config.token && config.server && config.printers?.length) await fetchTask(config);
}
