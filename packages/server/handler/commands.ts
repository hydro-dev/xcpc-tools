import { Context } from 'cordis';
import { BadRequestError } from '@hydrooj/framework';
import { config } from '../config';
import { executeOnHost } from '../utils';
import { AuthHandler } from './misc';
import { dispatchPendingProbeCommands, getActiveProbeMacs } from './monitor';

class CommandsHandler extends AuthHandler {
    async get() {
        const commands = await this.ctx.db.command.find({}).sort({ time: -1 }).limit(100);
        const monitors = await this.ctx.db.monitor.find({});
        const monitorMap = new Map(monitors.map((m) => [m.mac, m]));
        const activeProbeMacs = new Set(getActiveProbeMacs());
        const v1OnlyCount = monitors
            .filter((monitor) => (
                monitor.protocol === 'v1'
                && monitor.updateAt > Date.now() - 120_000
                && !activeProbeMacs.has(monitor.mac)
            )).length;
        const targets = monitors
            .filter((monitor) => monitor.protocol === 'v2' || activeProbeMacs.has(monitor.mac))
            .map((monitor) => ({
                mac: monitor.mac,
                name: monitor.name || '',
                hostname: monitor.hostname || '',
                connected: activeProbeMacs.has(monitor.mac),
            }));
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
        this.response.body = { commands: commandsWithInfo, targets, v1OnlyCount };
    }

    async postCommand({ command, target, broadcast = false, mode = 'heartbeat' }) {
        if (!command || typeof command !== 'string') throw new BadRequestError('Command', null, 'Command is required');
        if (mode !== 'heartbeat' && mode !== 'ssh') throw new BadRequestError('Invalid command mode');
        if (broadcast === true) {
            if (mode === 'heartbeat') {
                const activeProbeMacs = getActiveProbeMacs();
                const knownV2Macs = (await this.ctx.db.monitor.find({}))
                    .filter((monitor) => monitor.protocol === 'v2')
                    .map((monitor) => monitor.mac);
                target = [...activeProbeMacs, ...knownV2Macs];
            } else {
                target = (await this.ctx.db.monitor.find({ updateAt: { $gt: Date.now() - 120_000 } })).map((monitor) => monitor.mac);
            }
        } else if (!Array.isArray(target) || !target.length) {
            throw new BadRequestError('Select at least one machine');
        }
        if (!target.length) throw new BadRequestError(mode === 'heartbeat' ? 'No v2 machines found' : 'No machines are online');
        target = Array.from(new Set(target.map((mac) => String(mac).replace(/:/g, '').toUpperCase())));
        if (target.some((mac) => !/^[0-9A-F]{12}$/.test(mac) || mac === '000000000000')) {
            throw new BadRequestError('Invalid MAC address');
        }
        if (mode === 'heartbeat') {
            const res = await this.ctx.db.command.insert({
                command,
                time: Date.now(),
                target,
                pending: target,
                executionResult: {},
            });
            await dispatchPendingProbeCommands(target);
            this.response.body = { id: res._id };
        } else {
            this.response.body = await this.executeForTargets(command, target);
        }
    }

    async postRemove({ command }) {
        await this.ctx.db.command.deleteOne({ _id: command }, {});
        this.response.body = { success: true };
    }

    async executeForTargets(command: string, target: string[], t = 10000) {
        const selected = new Set(target);
        const allOnline = await this.ctx.db.monitor.find({ updateAt: { $gt: Date.now() - 120_000 } });
        const result = await Promise.allSettled(
            allOnline
                .filter((monitor) => selected.has(monitor.mac))
                .map((monitor) => executeOnHost(monitor.ip, command, t, config.customKeyfile)),
        );
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
