/* eslint-disable no-empty-pattern */
/* eslint-disable no-await-in-loop */
import child from 'child_process';
import fs from 'fs';
import { homedir } from 'os';
import { Context } from 'cordis';
import { param, Types } from '@hydrooj/framework';
import { Logger } from '../utils';
import { AuthHandler } from './misc';

const logger = new Logger('handler/commands');

async function asyncCommand(command: string | string[], timeout = 10000) {
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

const keyfile = fs.existsSync(`${homedir()}.ssh/id_rsa`) ? '.ssh/id_rsa' : '.ssh/id_ed25519';

async function executeOnHost(host: string, command: string, timeout = 10000) {
    logger.info('executing', command, 'on', host);
    return await asyncCommand([
        'ssh', '-o', 'StrictHostKeyChecking no', '-o', `IdentityFile ~/${keyfile}`,
        `root@${host}`,
        'bash', '-c', `'echo $(echo ${Buffer.from(command).toString('base64')} | base64 -d | bash)'`,
    ], timeout);
}

class CommandsHandler extends AuthHandler {
    async get() {
        this.response.body = '';
    }

    @param('command', Types.String)
    async postCommand({ }, command: string) {
        this.response.body = this.executeForAll(command);
    }

    async executeForAll(command: string, t = 10000) {
        const allOnline = await this.ctx.db.monitor.find({});
        const result = await Promise.allSettled(allOnline.map((i) => executeOnHost(i.ip, command, t)));
        return {
            success: result.filter((i) => i.status === 'fulfilled').length,
            fail: result.filter((i) => i.status === 'rejected').length,
            result: result.map((i) => (i.status === 'fulfilled' ? i.value : i.reason)),
        };
    }

    async postShowIds() {
        this.response.body = await this.executeForAll(`
export ISAUTOLOGIN=$(cat /etc/gdm3/custom.conf | grep AutomaticLoginEnable | grep true)
if [ -z "$ISAUTOLOGIN" ]; then
    export DISPLAY=:1
else
    export DISPLAY=:0
fi
export XAUTHORITY=/run/user/1000/gdm/Xauthority
zenity --info --text "<span font='256'>$(cat ${global.Tools.config.seatFile})</span>"`);
    }

    async postSetHostname() {
        this.response.body = await this.executeForAll(`hostnamectl hostname $(cat ${global.Tools.config.seatFile})`);
    }

    async postAutologin({ }, autologin = false) {
        this.response.body = await this.executeForAll(`
cp /etc/gdm3/custom-${autologin ? 'autologin' : 'nologin'}.conf /etc/gdm3/custom.conf
systemctl restart gdm`);
    }

    async postReboot() {
        this.response.body = await this.executeForAll('reboot');
    }
}

export async function apply(ctx: Context) {
    ctx.Route('commands', '/commands', CommandsHandler);
}
