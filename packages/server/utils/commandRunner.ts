import child from 'node:child_process';
import fs from 'node:fs';
import { homedir } from 'node:os';
import { Logger } from './index';

const logger = new Logger('runner');

export async function asyncCommand(command: string | string[], timeout = 10000) {
    let result = '';
    const proc = typeof command === 'string' ? child.exec(command) : child.spawn(command[0], command.slice(1));
    proc.stdout?.on('data', (d) => {
        result += d.toString();
    });
    proc.stderr?.on('data', (d: Buffer) => {
        logger.error(' STDERR ', d.toString());
    });
    if (!timeout) {
        proc.on('exit', () => { });
        setTimeout(() => proc.kill(), 1000);
        return '';
    }
    return await new Promise<string>((resolve, reject) => {
        const t = setTimeout(() => {
            proc.kill();
            reject(new Error('timeout'));
        }, timeout);
        proc.on('exit', (code) => {
            clearTimeout(t);
            if (code === 0) {
                resolve(result.replace(/\r/g, ''));
            } else {
                reject(code);
            }
        });
    });
}

const keyfile = fs.existsSync(`${homedir()}.ssh/id_rsa`) ? '~/.ssh/id_rsa' : '~/.ssh/id_ed25519';

export async function executeOnHost(host: string, command: string, timeout = 10000, customKeyfile?: string) {
    logger.info('executing', command, 'on', host);
    return await asyncCommand([
        'ssh', '-o', 'StrictHostKeyChecking no', '-o', `IdentityFile ${customKeyfile || keyfile}`,
        '-o', 'UserKnownHostsFile /dev/null',
        `root@${host}`,
        'bash', '-c', `'echo $(echo ${Buffer.from(command).toString('base64')} | base64 -d | bash)'`,
    ], timeout);
}
