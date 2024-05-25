/* eslint-disable no-await-in-loop */
import path from 'path';
import { getPrinters, print } from 'unix-print';
import winPrint from '@myteril/node-win-printer';
// https://www.sumatrapdfreader.org//dl//rel/3.1.2/SumatraPDF-3.1.2.zip
import { createTypstCompiler, generateTypst } from './typst';
import { fs, Logger, sleep } from './utils';

let compiler;

const logger = new Logger('printer');

let timer = null;

async function fetchTask(c) {
    if (timer) clearTimeout(timer);
    logger.info('Fetching Task from tools server...');
    try {
        const printersInfo = await getPrinters();
        const { body } = await superagent.post(`${c.server}/client/${c.token}/print`)
            .send({
                printers: global.Tools.printers,
                printersInfo: JSON.stringify(await printersInfo.map((p) => ({
                    printer: p.printer,
                    status: p.status,
                    description: p.description,
                }))),
            });
        if (body.setPrinter) {
            global.Tools.printers = body.setPrinter;
            fs.writeFileSync(path.resolve(process.cwd(), 'data/printer.json'), JSON.stringify(global.Tools.printers));
            logger.info(`Printer set to ${global.Tools.printer}`);
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
        if (global.Tools.printers.length) {
            // eslint-disable-next-line no-constant-condition
            while (true) {
                const printersInfo = await getPrinters();
                const printers = printersInfo.filter((p) => global.Tools.printers.includes(p.printer));
                const randomP = printers[Math.floor(Math.random() * printers.length)];
                if (randomP.status === 'idle') {
                    logger.info(`Printing ${_id} on ${randomP.printer}`);
                    await print(path.resolve(process.cwd(), `data/${tid}#${_id}.pdf`), randomP.printer, ['-P', '1-5']);
                    return;
                }
                for (const printer of printers.filter((p) => p.printer !== randomP.printer)) {
                    logger.info(`Checking ${printer.printer} ${printer.status}`);
                    if (printer.status === 'idle') {
                        logger.info(`Printing ${_id} on ${printer.printer}`);
                        await print(path.resolve(process.cwd(), `data/${tid}#${_id}.pdf`), printer.printer, ['-P', '1-5']);
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

export async function apply() {
    compiler = await createTypstCompiler();
    const { config } = global.Tools;
    if (!config) {
        logger.error('config not found');
        return;
    }
    if (config.token && config.server && config.printer) await fetchTask(config);
}
