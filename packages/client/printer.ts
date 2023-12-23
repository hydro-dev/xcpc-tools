/* eslint-disable no-await-in-loop */
import path from 'path';
import { createTypstCompiler } from '@myriaddreamin/typst.ts/dist/cjs/compiler.cjs';
import { getPrinters, print } from 'unix-print';
import {
    cachedFontInitOptions, fs, generateTypst, Logger, sleep,
} from './utils';

let compiler;

const logger = new Logger('printer');

async function ConvertCodeToPDF(code, lang, filename, team, location) {
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
        _id, code, lang, filename, team, location,
    } = doc;
    try {
        const docs = await ConvertCodeToPDF(code || 'empty file', lang, filename, team, location);
        fs.writeFileSync(path.resolve(process.cwd(), `data/${_id}.pdf`), docs);
        if (global.Tools.printers.length) {
            // eslint-disable-next-line no-constant-condition
            while (true) {
                const printersInfo = await getPrinters();
                const printers = printersInfo.filter((p) => global.Tools.printers.includes(p.printer));
                const randomP = printers[Math.floor(Math.random() * printers.length)];
                if (randomP.status === 'idle') {
                    logger.info(`Printing ${_id} on ${randomP.printer}`);
                    await print(path.resolve(process.cwd(), `data/${_id}.pdf`), randomP.printer, ['-P', '1-5']);
                    return;
                }
                for (const printer of printers.filter((p) => p.printer !== randomP.printer)) {
                    logger.info(`Checking ${printer.printer} ${printer.status}`);
                    if (printer.status === 'idle') {
                        logger.info(`Printing ${_id} on ${printer.printer}`);
                        await print(path.resolve(process.cwd(), `data/${_id}.pdf`), printer.printer, ['-P', '1-5']);
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
    compiler = createTypstCompiler();
    await compiler.init(await cachedFontInitOptions());
}
