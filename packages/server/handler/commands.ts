import { Context } from 'cordis';
import { BadRequestError } from '@hydrooj/framework';
import { config } from '../config';
import { executeOnHost } from '../utils';
import { AuthHandler } from './misc';

class CommandsHandler extends AuthHandler {
    async get() {
        const commands = await this.ctx.db.command.find({}).sort({ time: -1 }).limit(100);
        const monitors = await this.ctx.db.monitor.find({});
        const monitorMap = new Map(monitors.map((m) => [m.mac, m]));
        const commandsWithInfo = commands.map((cmd) => ({
            _id: cmd._id,
            command: cmd.command,
            target: cmd.target || [],
            executionResult: cmd.executionResult || {},
            targetInfo: (cmd.target || []).map((mac) => ({
                mac,
                hostname: monitorMap.get(mac)?.hostname || mac,
                name: monitorMap.get(mac)?.name || '',
            })),
            status: {
                total: cmd.target?.length || 0,
                completed: Object.keys(cmd.executionResult || {}).length,
                pending: (cmd.target?.length || 0) - Object.keys(cmd.executionResult || {}).length,
            },
        }));
        this.response.body = { commands: commandsWithInfo };
    }

    async postCommand({ command, target, mode = 'heartbeat' }) {
        if (!command || typeof command !== 'string') throw new BadRequestError('Command', null, 'Command is required');
        if (mode === 'heartbeat') {
            target ||= (await this.ctx.db.monitor.find({})).map((m) => m.mac);
            target = target.map((i) => i.replace(/:/g, ''));
            const res = await this.ctx.db.command.insert({
                command,
                time: Date.now(),
                target,
                pending: target,
                executionResult: {},
            });
            this.response.body = { id: res._id };
        } else {
            this.response.body = this.executeForAll(command);
        }
    }

    async postRemove({ command }) {
        await this.ctx.db.command.deleteOne({ _id: command }, {});
        this.response.body = { success: true };
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
}

export async function apply(ctx: Context) {
    ctx.Route('commands', '/commands', CommandsHandler);
}
