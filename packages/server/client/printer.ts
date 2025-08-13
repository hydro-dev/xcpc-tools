/* eslint-disable no-await-in-loop */
import path from 'node:path';
import chardet from 'chardet';
import * as iconv from 'iconv-lite';
import { PDFDocument } from 'pdf-lib';
import superagent from 'superagent';
import { config, saveConfig } from '../config';
import {
    fs, getPrinters, initWinPrinter, Logger, print, randomstring, sleep,
} from '../utils';
import { createTypstCompiler, generateTypst } from './typst';

let compiler;

const post = (url: string) => superagent.post(new URL(url, config.server).toString()).set('Accept', 'application/json');
const logger = new Logger('printer');

let timer = null;

const mergePDFs = async (files: string[], output: string) => {
    const pdf = await PDFDocument.create();
    pdf.setProducer('pdf-merger-js');
    pdf.setCreationDate(new Date());
    for (const file of files) {
        const srcDoc = await PDFDocument.load(fs.readFileSync(file));
        const srcPageCount = srcDoc.getPageCount();
        logger.info(`${file} has ${srcPageCount} pages`);
        const copiedPages = await pdf.copyPages(
            srcDoc,
            Array.from({ length: config.printPageMax > srcPageCount ? srcPageCount : config.printPageMax }, (_, i) => i),
        );
        for (const page of copiedPages) {
            pdf.addPage(page);
        }
    }
    logger.info(`Merged ${files.length} files into ${output}`);
    return fs.writeFileSync(output, await pdf.save());
};

function toUtf8(code: Buffer) {
    const info = chardet.detect(code);
    logger.debug(`detected as ${info}`);
    if (!info) return code.toString('utf8');
    return iconv.decode(code, info).toString();
}

export async function ConvertCodeToPDF(code: Buffer, lang, filename, team, location, codeColor = false) {
    compiler ||= await createTypstCompiler();
    const fakeFilename = randomstring(8); // cubercsl: do not trust filename from user
    const typst = generateTypst(team, location, fakeFilename, filename, lang, codeColor);
    compiler.addSource('/main.typst', typst);
    compiler.addSource(`/${fakeFilename}`, toUtf8(code));
    const docs = await compiler.compile({
        format: 'pdf',
        mainFilePath: '/main.typst',
    });
    compiler.addSource(`/${fakeFilename}`, '');
    logger.info(`Convert ${filename} to PDF`);
    return docs;
}

export async function printFile(docs) {
    try {
        let finalFile = null;
        const files = [];
        for (const doc of docs) {
            const {
                _id, tid, code, lang, filename, team, location,
            } = doc;
            const pdf = await ConvertCodeToPDF(
                code ? Buffer.from(code, 'base64') : Buffer.from('empty file'),
                lang,
                filename,
                team,
                location,
                config.printColor,
            );
            fs.writeFileSync(path.resolve(process.cwd(), `data${path.sep}${tid}#${_id}.pdf`), pdf);
            files.push(path.resolve(process.cwd(), `data${path.sep}${tid}#${_id}.pdf`));
        }
        if (files.length === 1) {
            finalFile = files[0];
        } else {
            finalFile = path.resolve(process.cwd(), `data${path.sep}${new Date().getTime()}-merged.pdf`);
            await mergePDFs(files, finalFile);
        }
        if (config.printers.length) {
            while (true) {
                const printersInfo: any[] = await getPrinters();
                const printers = printersInfo.filter((p) => config.printers.includes(p.printer));
                const randomP = printers[Math.floor(Math.random() * printers.length)];
                if (randomP.status === 'idle') {
                    logger.info(`Printing ${finalFile} on ${randomP.printer}`);
                    await print(finalFile, randomP.printer, 1, files.length > 1 ? undefined : config.printPageMax);
                    return randomP.printer;
                }
                for (const printer of printers.filter((p) => p.printer !== randomP.printer)) {
                    logger.info(`Checking ${printer.printer} ${printer.status}`);
                    if (printer.status === 'idle') {
                        logger.info(`Printing ${finalFile} on ${printer.printer}`);
                        await print(finalFile, printer.printer, 1, files.length > 1 ? undefined : config.printPageMax);
                        return printer.printer;
                    }
                }
                logger.info('No Printer can found to print, sleeping...');
                await sleep(3000);
            }
        }
        logger.error('No Printer Configured');
        return null;
    } catch (e) {
        logger.error(e);
        return null;
    }
}

async function fetchTask(c) {
    if (timer) clearTimeout(timer);
    logger.info('Fetching Task from tools server...');
    try {
        const printersInfo: any[] = await getPrinters();
        const tasks = [];
        for (let i = 0; i < config.printMergeQueue; i++) {
            const { body } = await post(`${c.server}client/${c.token}/print`)
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
                tasks.push(body.doc);
                // FIXME: so ugly, give server merge task number
                if (config.printMergeQueue !== 1) await post(`${c.server}client/${c.token}/doneprint/${body.doc._id}`);
            }
        }
        if (tasks.length) {
            logger.info(`Print task ${tasks.map((t) => `${t.tid}#${t._id}`).join(', ')}...`);
            let printer = null;
            try {
                printer = await printFile(tasks);
                if (!printer) throw new Error('No Printer Configured');
            } catch (e) {
                logger.error(e);
                throw e;
            }
            for (const doc of tasks) {
                await post(`${c.server}client/${c.token}/doneprint/${doc._id}?printer=${JSON.stringify(printer)}`);
                logger.info(`Print task ${doc.tid}#${doc._id} completed.`);
            }
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
    else logger.error('Config not found, please check the config.yaml');
}
