import fs from 'fs';
import path from 'path';
import winPrint from '@myteril/node-win-printer';
import unixPrint from 'unix-print';

let winPrinter: winPrint.PDFPrinter;

export interface Printer {
    printer: string;
    description?: string;
    status?: string;
    alerts?: string;
    connection?: string;
}

export function initWinPrinter() {
    const execPath = [
        './SumatraPDF.exe',
        path.resolve(__dirname, 'SumatraPDF.exe'),
        path.resolve(process.cwd(), 'SumatraPDF.exe'),
        'C:\\Program Files\\SumatraPDF\\SumatraPDF.exe',
        'C:\\Program Files (x86)\\SumatraPDF\\SumatraPDF.exe',
    ];
    const sumatraPdfPath = execPath.find((p) => fs.existsSync(p));
    if (!sumatraPdfPath) {
        throw new Error(`SumatraPDF not found, please install it on https://www.sumatrapdfreader.org/download-free-pdf-viewer,
or direct download from https://www.sumatrapdfreader.org/dl/rel/3.1.2/SumatraPDF-3.1.2.zip`);
    }
    winPrinter = new winPrint.PDFPrinter({
        sumatraPdfPath,
    });
}

const windowsPrinterStatus = {
    3: 'idle',
    4: 'printing',
};

export async function getPrinters(): Promise<Printer[]> {
    if (process.platform === 'win32') {
        const winprinters = await winPrint.getPrinters();
        return winprinters.map((p: any) => ({
            printer: p.DriverName,
            description: p.Caption,
            status: windowsPrinterStatus[p.PrinterStatus] ? windowsPrinterStatus[p.PrinterStatus] : 'unknown',
        }));
    }
    return unixPrint.getPrinters();
}

export async function print(printer: string, file: string, startPage?: number, endPage?: number) {
    if (process.platform === 'win32') {
        return winPrinter.print({
            file,
            printer,
            pages: startPage && endPage ? [{ start: startPage, end: endPage }] : undefined,
        });
    }
    return unixPrint.print(printer, file, startPage && endPage ? ['-P', `${startPage}-${endPage}`] : []);
}
