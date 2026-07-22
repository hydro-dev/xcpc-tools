/* eslint-disable no-await-in-loop */
import path from 'node:path';
import chardet from 'chardet';
import * as iconv from 'iconv-lite';
import { PDFDocument } from 'pdf-lib';
import superagent from 'superagent';
import { config } from '../config';
import {
    fs, getPrinters, initWinPrinter, Logger, print, randomstring, sleep,
} from '../utils';
import {
    setClientConnection, setPrinterStatus, updateClientTask,
} from './status';
import { createTypstCompiler, generateTypst } from './typst';

let compiler;

const post = (url: string) => superagent.post(new URL(url, config.server).toString()).set('Accept', 'application/json');
const logger = new Logger('printer');

let timer = null;
const CLIENT_PROTOCOL_VERSION = 2;

const configuredPrinters = () => {
    const printers = (config.printers || []).map((item: any) => (
        typeof item === 'string'
            ? { printer: item, group: '' }
            : { printer: String(item.printer || ''), group: String(item.group || '').trim().toUpperCase() }
    )).filter((item) => item.printer);
    const names = new Set<string>();
    for (const item of printers) {
        if (names.has(item.printer)) throw new Error(`Printer is configured more than once: ${item.printer}`);
        names.add(item.printer);
    }
    return printers;
};

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

function escapeText(s: string) {
    let res = '';
    for (const c of Array.from(s)) {
        res += /^[\p{L}\p{M}\p{N}\p{P}\p{S}\r\n\t ]$/u.test(c)
            ? c
            : (c.length === 1 && c.codePointAt(0) <= 0x7F)
                ? c.charCodeAt(0).toString(16).padStart(2, '0')
                : `U+${c.codePointAt(0).toString(16).toUpperCase()}`;
    }
    return res;
}

export async function ConvertCodeToPDF(code: Buffer, lang, filename, team, location, createAt, codeColor = false) {
    compiler ||= await createTypstCompiler();
    const fakeFilename = randomstring(8); // cubercsl: do not trust filename from user
    const typst = generateTypst(team, location, fakeFilename, filename, lang, createAt, codeColor);
    compiler.addSource('/main.typst', typst);
    compiler.addSource(`/${fakeFilename}`, escapeText(toUtf8(code)));
    logger.info(`Convert ${filename} to PDF`);
    try {
        return await compiler.compile({
            format: 'pdf',
            mainFilePath: '/main.typst',
        });
    } catch (e) {
        logger.error(e);
        compiler = await createTypstCompiler();
        throw e;
    } finally {
        compiler.addSource(`/${fakeFilename}`, '');
    }
}

export async function printFile(docs, targetPrinter = '') {
    let finalFile = null;
    const files = [];
    for (const doc of docs) {
        const {
            _id, tid, code, lang, filename, team, location, createAt,
        } = doc;
        if (!code) throw new Error(`Print task ${tid}#${_id} has no source content`);
        updateClientTask('print', _id, `${location || 'Unknown seat'} · ${filename}`, 'converting', { printer: targetPrinter });
        const pdf = await ConvertCodeToPDF(
            Buffer.from(code, 'base64'),
            lang,
            filename,
            team,
            location,
            createAt,
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
    const enabledPrinters = configuredPrinters().map((item) => item.printer);
    if (targetPrinter && !enabledPrinters.includes(targetPrinter)) {
        throw new Error(`Assigned printer is not enabled locally: ${targetPrinter}`);
    }
    while (enabledPrinters.length) {
        const printersInfo: any[] = await getPrinters();
        setPrinterStatus(printersInfo, enabledPrinters);
        const printers = printersInfo.filter((p) => (
            enabledPrinters.includes(p.printer)
            && (!targetPrinter || p.printer === targetPrinter)
            && p.status === 'idle'
        ));
        if (printers.length) {
            const randomP = targetPrinter ? printers[0] : printers[Math.floor(Math.random() * printers.length)];
            logger.info(`Printing ${finalFile} on ${randomP.printer}`);
            for (const doc of docs) {
                updateClientTask('print', doc._id, `${doc.location || 'Unknown seat'} · ${doc.filename}`, 'printing', { printer: randomP.printer });
            }
            await print(finalFile, randomP.printer, 1, files.length > 1 ? undefined : config.printPageMax);
            return randomP.printer;
        }
        logger.info(`No idle ${targetPrinter || 'enabled'} printer found, sleeping...`);
        await sleep(3000);
    }
    throw new Error('No Printer Configured');
}

async function releasePrintTask(c, doc, printError) {
    const message = printError instanceof Error ? printError.message : String(printError);
    while (true) {
        try {
            await post(`${c.server}client/${c.token}/releaseprint/${doc._id}`).send({ error: message });
            setClientConnection('print', true);
            logger.info(`Released print task ${doc.tid}#${doc._id} for redistribution.`);
            return;
        } catch (error) {
            const status = Number((error as any)?.status);
            if (status === 400 || status === 404) {
                setClientConnection('print', true);
                logger.warn(`Print task ${doc.tid}#${doc._id} no longer belongs to this client.`);
                return;
            }
            setClientConnection('print', false, error);
            logger.error(`Failed to release print task ${doc.tid}#${doc._id}, retrying...`, error);
            await sleep(3000);
        }
    }
}

async function fetchTask(c) {
    if (timer) clearTimeout(timer);
    logger.info('Fetching Task from tools server...');
    try {
        const printerConfigs = configuredPrinters();
        const printerGroups = new Map(printerConfigs.map((item) => [item.printer, item.group]));
        const enabledPrinters = printerConfigs.map((item) => item.printer);
        const printersInfo: any[] = await getPrinters();
        setPrinterStatus(printersInfo, enabledPrinters);
        const tasks = [];
        let targetPrinter = '';
        for (let i = 0; i < config.printMergeQueue; i++) {
            const { body } = await post(`${c.server}client/${c.token}/print`)
                .send({
                    protocolVersion: CLIENT_PROTOCOL_VERSION,
                    printers: enabledPrinters,
                    printersInfo: printersInfo.map((p) => ({
                        printer: p.printer,
                        status: p.status,
                        description: p.description,
                        group: printerGroups.get(p.printer) || undefined,
                    })),
                    preferredTargetPrinter: targetPrinter || undefined,
                });
            setClientConnection('print', true);
            if (body.doc) {
                const assignedPrinter = String(body.targetPrinter || body.doc.targetPrinter || '');
                if (targetPrinter && assignedPrinter && assignedPrinter !== targetPrinter) {
                    throw new Error(`Server mixed physical printers in one merge queue: ${targetPrinter} and ${assignedPrinter}`);
                }
                targetPrinter ||= assignedPrinter;
                tasks.push(body.doc);
                updateClientTask(
                    'print',
                    body.doc._id,
                    `${body.doc.location || 'Unknown seat'} · ${body.doc.filename}`,
                    'received',
                    { printer: targetPrinter },
                );
            }
        }
        if (tasks.length) {
            logger.info(`Print task ${tasks.map((t) => `${t.tid}#${t._id}`).join(', ')}...`);
            let printer = null;
            try {
                printer = await printFile(tasks, targetPrinter);
                if (!printer) throw new Error('No Printer Configured');
            } catch (e) {
                for (const doc of tasks) {
                    updateClientTask('print', doc._id, `${doc.location || 'Unknown seat'} · ${doc.filename}`, 'failed', {
                        printer: targetPrinter,
                        error: e,
                    });
                }
                await Promise.all(tasks.map((doc) => releasePrintTask(c, doc, e)));
                logger.error(e);
            }
            if (printer) {
                for (const doc of tasks) {
                    updateClientTask('print', doc._id, `${doc.location || 'Unknown seat'} · ${doc.filename}`, 'confirming', { printer });
                    let confirmed = false;
                    let rejected = false;
                    while (!confirmed) {
                        try {
                            await post(`${c.server}client/${c.token}/doneprint/${doc._id}`).query({ printer });
                            setClientConnection('print', true);
                            confirmed = true;
                        } catch (error) {
                            if (Number((error as any)?.status) === 400) {
                                setClientConnection('print', true);
                                updateClientTask('print', doc._id, `${doc.location || 'Unknown seat'} · ${doc.filename}`, 'failed', {
                                    printer,
                                    error,
                                });
                                logger.error(`Server rejected print completion for ${doc.tid}#${doc._id}; the task may have been reset by an administrator.`, error);
                                rejected = true;
                                break;
                            }
                            setClientConnection('print', false, error);
                            logger.error(`Failed to confirm print task ${doc.tid}#${doc._id}, retrying...`, error);
                            await sleep(3000);
                        }
                    }
                    if (rejected) continue;
                    updateClientTask('print', doc._id, `${doc.location || 'Unknown seat'} · ${doc.filename}`, 'done', { printer });
                    logger.info(`Print task ${doc.tid}#${doc._id} completed.`);
                }
            }
        } else {
            logger.info('No print task, sleeping...');
            await sleep(5000);
        }
    } catch (e) {
        setClientConnection('print', false, e);
        logger.error(e);
        await sleep(5000);
    }
    timer = setTimeout(() => fetchTask(c), 3000);
}

export async function apply() {
    compiler = await createTypstCompiler();
    const printers = configuredPrinters();
    if (process.platform === 'win32') {
        try {
            initWinPrinter();
        } catch (e) {
            logger.error(e);
            process.exit(1);
        }
    }
    if (config.token && config.server && printers.length) await fetchTask(config);
    else logger.error('Config not found, please check the config.yaml');
}
