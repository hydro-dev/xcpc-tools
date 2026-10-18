import fs from 'node:fs';
import path from 'node:path';
import { getPrinters as wingetPrinters, PDFPrinter as WinPDFPrint } from '@myteril/node-win-printer';
import { getPrinters as unixgetPrinters, print as unixPrint } from 'unix-print';
import { Logger } from './index';

const logger = new Logger('printer');

export interface Printer {
    printer: string;
    description?: string;
    status?: string;
    alerts?: string;
    connection?: string;
}

export function discoverSumatraPdf(): string {
    const execPath = [
        './SumatraPDF.exe',
        path.resolve(__dirname, 'SumatraPDF.exe'),
        path.resolve(process.cwd(), 'SumatraPDF.exe'),
        path.resolve(process.env.ProgramFiles, 'SumatraPDF' + path.sep + 'SumatraPDF.exe'),
        path.resolve(process.env['ProgramFiles(x86)'], 'SumatraPDF' + path.sep + 'SumatraPDF.exe'),
        path.resolve(process.env.LOCALAPPDATA, 'SumatraPDF' + path.sep + 'SumatraPDF.exe'),
        path.resolve(process.env.APPDATA, 'SumatraPDF' + path.sep + 'SumatraPDF.exe'),
    ];
    const sumatraPdfPath = execPath.find((p) => fs.existsSync(p));
    if (!sumatraPdfPath) {
        // eslint-disable-next-line max-len
        throw new Error('SumatraPDF not found, please install it on https://www.sumatrapdfreader.org/download-free-pdf-viewer, or direct download from https://www.sumatrapdfreader.org/dl/rel/3.1.2/SumatraPDF-3.1.2.zip');
    }
    logger.info(`SumatraPDF found at ${sumatraPdfPath}`);
    return sumatraPdfPath;
}

export const windowsPrinterStatus = {
    3: 'idle',
    4: 'printing',
};

export async function getPrinters(raw = false): Promise<object[]> {
    if (process.platform === 'win32') {
        const winprinters = await wingetPrinters();
        return raw ? winprinters : winprinters.filter((p: any) => p.DeviceID).map((p: any) => ({
            printer: p.DeviceID,
            description: p.Caption,
            status: windowsPrinterStatus[p.PrinterStatus] ? windowsPrinterStatus[p.PrinterStatus] : 'unknown',
        }));
    }
    return await unixgetPrinters();
}

export async function print(winPrinter: WinPDFPrint, file: string, printer: string, startPage?: number, endPage?: number) {
    if (process.platform === 'win32') {
        return winPrinter.print({
            file,
            printer,
            pages: startPage && endPage ? [{ start: startPage, end: endPage }] : undefined,
        });
    }
    return unixPrint(file, printer, startPage && endPage ? ['-P', `${startPage}-${endPage}`] : []);
}
