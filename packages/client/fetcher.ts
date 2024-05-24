import path from 'path';
import superagent from 'superagent';
import { getPrinters } from 'unix-print';
import { printFile } from './printer';
import { fs, Logger, sleep } from './utils';

const logger = new Logger('fetcher');

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

export async function apply() {
    const { config } = global.Tools;
    if (!config) {
        logger.error('config not found');
        return;
    }
    if (config.token && config.server) await fetchTask(config);
}
