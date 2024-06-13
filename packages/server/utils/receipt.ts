import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';
import { Logger, windowsPrinterStatus } from '.';

const logger = new Logger('receipt');

export async function checkReceiptPrinter(printers: object[]) {
    if (process.platform === 'linux') {
        const usbDevices = fs.readdirSync('/dev/usb');
        for (const f of usbDevices) {
            if (f.startsWith('lp')) {
                const lpid = fs.readFileSync(`/sys/class/usbmisc/${f}/device/ieee1284_id`, 'utf8').trim();
                logger.info(`USB Printer ${f} found: ${lpid}`);
                logger.info(`If you want to use this printer for balloon print, please set balloon: /dev/usb/${f} in config.yaml.`);
            }
        }
        if (!usbDevices.length) logger.info('If you want to use balloon client, please connect your receipt printer first.');
    } else if (process.platform === 'win32') {
        const shared = printers.filter((p: any) => p.DeviceID).filter((p: any) => p.ShareName).map((p: any) => ({
            printer: `\\\\${p.SystemName}\\${p.ShareName}`,
            device: p.DeviceID,
            description: p.Caption,
            status: windowsPrinterStatus[p.PrinterStatus] ? windowsPrinterStatus[p.PrinterStatus] : 'unknown',
        }));
        for (const printer of shared) {
            logger.info(`Receipt Shared Printer ${printer.printer}(${printer.device})) found: ${printer.description}`);
            logger.info(`If you want to use this printer for balloon print, please set balloon: ${printer.printer} in config.yaml.`);
        }
        if (!shared.length) logger.info('If you want to use balloon client, please share your receipt printer on settings first.');
    } else if (process.platform === 'darwin') {
        logger.info('If you want to use balloon client, please set balloon: "{printer name}" in config.yaml.');
    } else logger.info('If you want to use balloon client, please run this on Linux/Windows/MacOS');
}

export async function checkReceiptStatus(printer) {
    if (process.platform !== 'linux') {
        printer = { printer: printer.printer };
        return;
    }
    const lp = printer.printer.split('/').pop();
    const oldPrinter = printer;
    printer = {
        printer: printer.printer,
        info: fs.readFileSync(`/sys/class/usbmisc/${lp}/device/ieee1284_id`, 'utf8').trim(),
    };
    if (!oldPrinter || oldPrinter.info === printer.info) return;
    logger.info('Printer changed:', printer.printer, printer.info);
    const usbDevices = fs.readdirSync('/dev/usb');
    for (const f of usbDevices) {
        if (f.startsWith('lp')) {
            const lpid = fs.readFileSync(`/sys/class/usbmisc/${f}/device/ieee1284_id`, 'utf8').trim();
            if (lpid === oldPrinter.info) {
                logger.info('Printer found:', f, ':', lpid);
                oldPrinter.printer = `/dev/usb/${f}`;
                printer = oldPrinter;
                break;
            }
        }
    }
    if (oldPrinter.info !== printer.info) throw Error('Printer not found, please check the printer connection.');
}

export async function receiptPrint(text, printer) {
    fs.writeFileSync(path.resolve(process.cwd(), 'data', 'balloon.txt'), text);
    if (process.platform === 'win32') {
        exec(`COPY /B "${path.resolve(process.cwd(), 'data', 'balloon.txt')}" "${printer.printer}"`, (err, stdout, stderr) => {
            if (err) logger.error(err);
            if (stdout) logger.info(stdout);
            if (stderr) logger.error(stderr);
        });
    } else if (process.platform === 'darwin') exec(`lpr -P ${printer.printer} -o raw ${path.resolve(process.cwd(), 'data', 'balloon.txt')}`);
    else fs.writeFileSync(path.resolve(printer.printer), text);
}
