/* eslint-disable no-await-in-loop */
import path from 'path';
import { createTypstCompiler } from '@myriaddreamin/typst.ts/dist/cjs/compiler.cjs';
import { getPrinters, print } from 'unix-print';
import { fs, Logger, sleep } from '@hydrooj/utils';
import { cachedFontInitOptions, generateTypst } from './utils';

let compiler;

const logger = new Logger('printer');

async function ConvertCodeToPDF(code, lang, filename, team, location) {
    const typst = generateTypst(team, location, filename, lang);
    compiler.addSource(path.resolve(__dirname, 'main.typst'), typst);
    compiler.addSource(path.resolve(__dirname, filename), code);
    const docs = await compiler.compile({
        format: 'pdf',
        mainFilePath: path.resolve(__dirname, 'main.typst'),
    });
    logger.info(`Convert ${filename} to PDF`);
    return docs;
}

export async function apply(ctx) {
    compiler = createTypstCompiler();
    await compiler.init(await cachedFontInitOptions());
    ctx.on('code/print', async (doc) => {
        const {
            _id, code, lang, filename, team, location,
        } = doc;
        const docs = await ConvertCodeToPDF(code, lang, filename, team, location);
        fs.writeFileSync(path.resolve(__dirname, `data/${_id}.pdf`), docs);
        if (global.Tools.printers.length) {
            const printersInfo = await getPrinters();
            const printers = printersInfo.filter((p) => global.Tools.printers.includes(p.printer));
            // eslint-disable-next-line no-constant-condition
            while (true) {
                const randomP = printers[Math.floor(Math.random() * printers.length)];
                if (randomP.status === 'idle') {
                    logger.info(`Printing ${_id} on ${randomP.printer}`);
                    await print(path.resolve(__dirname, `data/${_id}.pdf`), randomP.printer, ['-P', '1-5']);
                    return;
                }
                for (const printer of printers.filter((p) => p.printer !== randomP.printer)) {
                    logger.info(`Checking ${printer.printer} ${printer.status}`);
                    if (printer.status === 'idle') {
                        logger.info(`Printing ${_id} on ${printer.printer}`);
                        await print(path.resolve(__dirname, `data/djpc_${_id}.pdf`), printer.printer, ['-P', '1-5']);
                        return;
                    }
                    await sleep(3000);
                }
            }
        }
    });
}
