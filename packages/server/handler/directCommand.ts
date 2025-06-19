/* eslint-disable no-empty-pattern */
import { Context } from 'cordis';
import { AuthHandler } from './misc';
import * as net from 'net';
import { BadRequestError } from '@hydrooj/framework';

class DirectCommandHandler extends AuthHandler {
    async post({ host, port, op, authKey }) {
        // 参数验证
        if (!host) throw new BadRequestError('Host', null, '目标主机IP是必须的');
        if (!port) port = 65432;
        if (!op) throw new BadRequestError('Operation', null, '操作类型是必须的');
        
        try {
            const result = await this.sendTCPCommand(host, port, op, authKey);
            this.response.body = { success: true, message: result };
        } catch (error) {
            this.response.status = 500;
            this.response.body = { error: error.message };
        }
    }
    
    // 发送TCP命令的方法
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
}

export async function apply(ctx: Context) {
    ctx.Route('direct_command', '/api/direct-command', DirectCommandHandler);
}