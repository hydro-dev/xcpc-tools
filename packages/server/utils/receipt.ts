import { exec } from 'node:child_process';
import path from 'node:path';
import fs from 'fs-extra';
import { Logger, windowsPrinterStatus } from './index';

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

export async function receiptPrint(printer: string, text: string | Uint8Array, printCommand = '') {
    const filename = `balloon-${Date.now()}.txt`;
    if (printer.startsWith('auto')) {
        if (process.platform !== 'linux') throw new Error('Auto printer is only supported on Linux');
        const matcher = (printer.slice(5) || '').trim();
        const files = fs.readdirSync('/dev/usb');
        for (const file of files) {
            // eslint-disable-next-line no-await-in-loop
            const info = (await fs.readFile(`/sys/class/usbmisc/${file}/device/ieee1284_id`, 'utf8')).trim();
            if (info.includes(matcher)) {
                printer = `/dev/usb/${file}`;
                break;
            }
        }
        if (!printer) throw new Error('Auto printer not found');
    }
    const command = printCommand
        ? printCommand.replace(/\{file\}/g, path.resolve(process.cwd(), 'data', filename))
        : process.platform === 'win32'
            ? `COPY /B "${path.resolve(process.cwd(), 'data', filename)}" "${printer}"`
            : process.platform === 'darwin'
                ? `lpr -P ${printer} -o raw ${path.resolve(process.cwd(), 'data', filename)}`
                : null;
    if (command) {
        await fs.writeFile(path.resolve(process.cwd(), 'data', filename), text);
        await new Promise((resolve, reject) => {
            exec(command, (err, stdout, stderr) => {
                if (err) {
                    logger.error(err);
                    reject(err);
                }
                if (stdout) logger.info(stdout);
                if (stderr) logger.error(stderr);
                resolve(null);
            });
        });
    } else await fs.writeFile(path.resolve(printer), text);
}
