import { Context, Service } from 'cordis';
import { PDFPrinter as WinPDFPrint } from '@myteril/node-win-printer';
import { randomstring } from '../utils';
import { discoverSumatraPdf } from '../utils/printers';
import { createTypstCompiler, generateTypst } from '../client/typst';

// Block 5: the Windows printer handle (utils/printers.ts) and the shared
// Typst compiler instance (client/printer.ts) used to be lazily created
// module-level singletons, and ConvertCodeToPDF lived in the client module
// even though the server-side print handler also needs it. PrintersService
// now owns the compiler cache and the code-to-PDF conversion so both
// consumers share one cache through the context.

export class PrintersService extends Service {
    private compiler;
    private winPrinter: WinPDFPrint;

    constructor(ctx: Context) {
        super(ctx, 'printers');
    }

    /** Lazily create the Windows PDF printer handle (SumatraPDF backend). */
    initWinPrinter() {
        if (this.winPrinter) return;
        this.winPrinter = new WinPDFPrint({ sumatraPdfPath: discoverSumatraPdf() });
    }

    get winPrint() {
        return this.winPrinter;
    }

    /** Convert source code to a PDF via the shared Typst compiler (was
     *  ConvertCodeToPDF in client/printer.ts). */
    async convertCodeToPDF(
        code: Buffer,
        lang: any,
        filename: any,
        team: any,
        location: any,
        createAt: any,
        codeColor = false,
        escapeText: (s: string) => string,
        toUtf8: (b: Buffer) => string,
    ) {
        this.compiler ||= await createTypstCompiler();
        const fakeFilename = randomstring(8); // cubercsl: do not trust filename from user
        const typst = generateTypst(team, location, fakeFilename, filename, lang, createAt, codeColor);
        this.compiler.addSource('/main.typst', typst);
        this.compiler.addSource(`/${fakeFilename}`, escapeText(toUtf8(code)));
        this.ctx.logger('printer').info(`Convert ${filename} to PDF`);
        try {
            return await this.compiler.compile({
                format: 'pdf',
                mainFilePath: '/main.typst',
            });
        } catch (e) {
            this.ctx.logger('printer').error(e);
            this.compiler = await createTypstCompiler();
            throw e;
        } finally {
            this.compiler.addSource(`/${fakeFilename}`, '');
        }
    }
}

declare module 'cordis' {
    interface Context {
        printers: PrintersService;
    }
}
