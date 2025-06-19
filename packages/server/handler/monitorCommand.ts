import { Context } from 'cordis';
import { Handler, BadRequestError } from '@hydrooj/framework';
import { AuthHandler } from './misc';
import * as net from 'net';

class MonitorCommandHandler extends AuthHandler {
    async post({ host, port, authKey, command }) {
        if (!host) throw new BadRequestError('Host', null, '主机IP不能为空');
        if (!command) throw new BadRequestError('Command', null, '命令不能为空');
        port = port || 4567;
        try {
            const result = await this.sendRemoteCommand(host, port, authKey, command);
            this.response.body = { data: result };
        } catch (error) {
            this.response.status = 500;
            this.response.body = { error: error.message };
        }
    }

    private async sendRemoteCommand(host: string, port: number, authKey: string, command: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const client = new net.Socket();
            let buffer = Buffer.alloc(0);
            let expectedLen: number | null = null;

            client.once('error', (err) => {
                client.destroy();
                reject(new Error(`无法连接到 ${host}:${port} - ${err.message}`));
            });

            client.connect(port, host, () => {
                const payload = Buffer.from(`${authKey}:${command}`, 'utf-8');
                const header = Buffer.alloc(4);
                header.writeUInt32BE(payload.length, 0);
                client.write(Buffer.concat([header, payload]));
            });

            client.on('data', (chunk) => {
                buffer = Buffer.concat([buffer, chunk]);
                if (expectedLen === null && buffer.length >= 4) {
                    expectedLen = buffer.readUInt32BE(0);
                    buffer = buffer.slice(4);
                }
                if (expectedLen !== null && buffer.length >= expectedLen) {
                    const respBuf = buffer.slice(0, expectedLen);
                    client.destroy();
                    resolve(respBuf.toString('utf-8'));
                }
            });
        });
    }
}

export async function apply(ctx: Context) {
    ctx.Route('monitor_command', '/monitor/command', MonitorCommandHandler);
}