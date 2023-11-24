/* eslint-disable no-await-in-loop */
import path from 'path';
import { createTypstCompiler } from '@myriaddreamin/typst.ts/dist/cjs/compiler.cjs';
import { getPrinters, print } from 'unix-print';
import { fs, Logger, sleep } from '@hydrooj/utils';
import { cachedFontInitOptions, generateTypst } from './utils';

const logger = new Logger('printer');

async function ConvertCodeToPDF(code, lang, filename, team, location) {
    const compiler = createTypstCompiler();
    await compiler.init(await cachedFontInitOptions());
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
    ctx.on('code/print', async (doc) => {
        const {
            _id, code, lang, filename, team, location,
        } = doc;
        const docs = await ConvertCodeToPDF(code, lang, filename, team, location);
        fs.writeFileSync(path.resolve(__dirname, `data/${_id}.pdf`), docs);
        if (global.Tools.printers.length) {
            const printersInfo = await getPrinters();
            const printers = printersInfo.map((p) => global.Tools.printers.includes(p.printer));
            // eslint-disable-next-line no-constant-condition
            while (true) {
                for (const printer of printers) {
                    if (printer.status === 'idle') {
                        logger.info(`Printing ${_id} on ${printer.printer}`);
                        await print(path.resolve(__dirname, `data/${_id}.pdf`), printer);
                        return;
                    }
                }
                await sleep(1000);
            }
        }
    });
}
