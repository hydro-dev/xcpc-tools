import { Context, Service } from 'cordis';
import { PDFPrinter as WinPDFPrint } from '@myteril/node-win-printer';
import { randomstring } from '../utils';
import { discoverSumatraPdf } from '../utils/printers';
import { createTypstCompiler, generateTypst } from '../client/typst';

export class PrintersService extends Service {
    private compiler;
    private winPrinter: WinPDFPrint;

    constructor(ctx: Context) {
        super(ctx, 'printers');
    }

    initWinPrinter() {
        if (this.winPrinter) return;
        this.winPrinter = new WinPDFPrint({ sumatraPdfPath: discoverSumatraPdf() });
    }

    get winPrint() {
        return this.winPrinter;
    }

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
        const fakeFilename = randomstring(8);
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
