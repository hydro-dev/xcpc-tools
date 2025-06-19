/* eslint-disable no-empty-pattern */
/* eslint-disable no-await-in-loop */
import { Context } from 'cordis';
import { BadRequestError } from '@hydrooj/framework';
import { config } from '../config';
import { executeOnHost } from '../utils';
import { AuthHandler } from './misc';
import * as net from 'net';

class CommandsHandler extends AuthHandler {
    async get() {
        this.response.body = '';
    }

    async postCommand({ command }) {
        if (!command || typeof command !== 'string') throw new BadRequestError('Command', null, 'Command is required');
        this.response.body = this.executeForAll(command);
    }

    async executeForAll(command: string, t = 10000) {
        const allOnline = await this.ctx.db.monitor.find({});
        const result = await Promise.allSettled(allOnline.map((i) => executeOnHost(i.ip, command, t, config.customKeyfile)));
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
zenity --info --text "<span font='256'>$(cat ${config.seatFile})</span>"`);
    }

    async postSetHostname() {
        this.response.body = await this.executeForAll(`hostnamectl hostname $(cat -- ${config.seatFile})`);
    }

    async postAutologin({ }, autologin = false) {
        this.response.body = await this.executeForAll(`
cp /etc/gdm3/custom-${autologin ? 'autologin' : 'nologin'}.conf /etc/gdm3/custom.conf
systemctl restart gdm`);
    }

    async postReboot() {
        this.response.body = await this.executeForAll('reboot');
    }

    // 直接发送TCP请求锁屏
    async postLockScreens() {
        const allOnline = await this.ctx.db.monitor.find({});
        const results = await Promise.allSettled(allOnline.map((monitor) => 
            this.sendTCPCommand(monitor.ip, 65432, 'LOCK', 'BiGCIcPc')
        ));
        
        // 修复: 将结果设置为response.body而不是直接返回
        this.response.body = {
            success: results.filter((i) => i.status === 'fulfilled').length,
            fail: results.filter((i) => i.status === 'rejected').length,
            result: results.map((i) => (i.status === 'fulfilled' ? i.value : i.reason)),
        };
    }

    // 直接发送TCP请求解锁
    async postUnlockScreens() {
        const allOnline = await this.ctx.db.monitor.find({});
        const results = await Promise.allSettled(allOnline.map((monitor) => 
            this.sendTCPCommand(monitor.ip, 65432, 'UNLOCK', 'BiGCIcPc')
        ));
        
        // 修复: 将结果设置为response.body而不是直接返回
        this.response.body = {
            success: results.filter((i) => i.status === 'fulfilled').length,
            fail: results.filter((i) => i.status === 'rejected').length,
            result: results.map((i) => (i.status === 'fulfilled' ? i.value : i.reason)),
        };
    }

    // 发送TCP命令的通用方法
    private async sendTCPCommand(host: string, port: number, op: string, authKey?: string): Promise<string> {
        return new Promise((resolve, reject) => {
            try {
                const client = new net.Socket();
                const timeout = setTimeout(() => {
                    client.destroy();
                    reject(new Error(`向 ${host}:${port} 发送命令超时`));
                }, 5000);

                client.connect(port, host, () => {
                    // 构建命令，如果有认证密钥则添加
                    let command = op;
                    if (authKey) {
                        command = `${command}:${authKey}`;
                    }
                    
                    client.write(`${command}\n`);
                });

                client.on('data', (data) => {
                    clearTimeout(timeout);
                    const response = data.toString().trim();
                    client.destroy();
                    resolve(`来自 ${host} 的响应: ${response}`);
                });

                client.on('error', (err) => {
                    clearTimeout(timeout);
                    client.destroy();
                    reject(new Error(`无法连接到 ${host}:${port} - ${err.message}`));
                });

                client.on('close', () => {
                    clearTimeout(timeout);
                });
            } catch (error) {
                reject(new Error(`发生错误: ${error.message}`));
            }
        });
    }

    // 新增: Windows 一键执行任意命令
    async postWinCommand({ command }) {
        if (!command || typeof command !== 'string') throw new BadRequestError('Command', null, 'Command is required');
        const allOnline = await this.ctx.db.monitor.find({});
        const results = await Promise.allSettled(allOnline.map((monitor) =>
            this.sendWinCommand(monitor.ip, config.winPort || 4567, config.winAuthKey || 'BiGCIcPc', command)
        ));
        this.response.body = {
            success: results.filter((r) => r.status === 'fulfilled').length,
            fail: results.filter((r) => r.status === 'rejected').length,
            result: results.map((r) => r.status === 'fulfilled' ? (r.value as string) : (r.reason as Error).message),
        };
    }

    // 私有方法: 发送 Windows 远程命令
    private async sendWinCommand(host: string, port: number, authKey: string, command: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const client = new net.Socket();
            let buffer = Buffer.alloc(0);
            let expectedLen: number | null = null;
            client.once('error', (err) => { client.destroy(); reject(new Error(`无法连接到 ${host}:${port} - ${err.message}`)); });
            client.connect(port, host, () => {
                const payload = Buffer.from(`${authKey}:${command}`, 'utf-8');
                const header = Buffer.alloc(4);
                header.writeUInt32BE(payload.length, 0);
                client.write(Buffer.concat([header, payload]));
            });
            client.on('data', (chunk) => {
                buffer = Buffer.concat([buffer, chunk]);
                if (expectedLen === null && buffer.length >= 4) { expectedLen = buffer.readUInt32BE(0); buffer = buffer.slice(4); }
                if (expectedLen !== null && buffer.length >= expectedLen) {
                    const resp = buffer.slice(0, expectedLen).toString('utf-8');
                    client.destroy(); resolve(resp);
                }
            });
        });
    }
}

export async function apply(ctx: Context) {
    ctx.Route('commands', '/commands', CommandsHandler);
}
