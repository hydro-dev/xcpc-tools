import fs from 'fs';
import winPrint from '@myteril/node-win-printer';
import unixPrint from 'unix-print';
import path from 'path';

let winPrinter: winPrint.PDFPrinter;

if (process.platform === 'win32') {
    const execPath = [
        './SumatraPDF.exe',
        path.resolve(__dirname, 'SumatraPDF.exe'),
        path.resolve(process.cwd(), 'SumatraPDF.exe'),
        'C:\\Program Files\\SumatraPDF\\SumatraPDF.exe',
        'C:\\Program Files (x86)\\SumatraPDF\\SumatraPDF.exe',
    ];
    const sumatraPdfPath = execPath.find((p) => fs.existsSync(p));
    if (!sumatraPdfPath) {
        throw new Error('SumatraPDF not found, please install it on https://www.sumatrapdfreader.org/download-free-pdf-viewer');
    }
    winPrinter = new winPrint.PDFPrinter({
        sumatraPdfPath,
    });
}

export async function getPrinters() {
    if (process.platform === 'win32') {
        return winPrint.getPrinters();
    }
    return unixPrint.getPrinters();
}

export async function print(printer, file) {
    if (process.platform === 'win32') {
        return winPrinter.print({
            file,
            printer,
        });
    }
    return unixPrint.print(printer, file);
}
