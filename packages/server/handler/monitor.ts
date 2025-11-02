import { Context, Schema } from 'cordis';
import { BadRequestError, Handler } from '@hydrooj/framework';
import { AuthHandler } from './misc';

class MonitorAdminHandler extends AuthHandler {
    async get(params) {
        const { nogroup } = params;
        const monitors = await this.ctx.db.monitor.find({}).sort({ name: 1 });
        const monitorDict = {};
        const groups = {};
        groups['#ErrMachine'] = [];
        for (const monitor of monitors) {
            monitorDict[monitor.name || monitor._id] = monitor;
            if (!nogroup && monitor.group) {
                groups[monitor.group] ||= [];
                groups[monitor.group].push(monitor.name || monitor._id);
            }
            if (monitor.updateAt < new Date().getTime() - 120 * 1000) {
                groups['#ErrMachine'].push(monitor.name || monitor._id);
            }
        }
        this.response.body = { monitors: monitorDict };
        if (!nogroup) this.response.body.groups = groups;
    }

    async postUpdate(params) {
        const {
            _id, name, group, camera, desktop,
        } = params;
        if (!_id) throw new BadRequestError();
        const m = await this.ctx.db.monitor.findOne({ _id });
        if (!m) throw new BadRequestError();
        const samem = await this.ctx.db.monitor.findOne({ name });
        if (samem && samem._id !== _id) throw new BadRequestError('Name already exists');
        this.ctx.db.monitor.update({ _id }, {
            $set: {
                ...name && { name },
                ...group && { group },
                ...camera && { camera },
                ...desktop && { desktop },
            },
        });
        this.response.body = { success: true };
    }

    async postDelete(params) {
        const { _id } = params;
        if (!_id) throw new BadRequestError();
        const m = await this.ctx.db.monitor.findOne({ _id });
        if (!m) throw new BadRequestError();
        await this.ctx.db.monitor.remove({ _id }, {});
        this.response.body = { success: true };
    }

    async postCleanAll() {
        await this.ctx.db.monitor.remove({}, { multi: true });
        this.response.body = { success: true };
    }

    async postUpdateAll(params) {
        const {
            name, group, camera, desktop, ips,
        } = params;
        const monitors = await this.ctx.db.monitor.find({ ...ips ? { ip: { $in: ips.split('\n').map((ip) => ip.trim()) } } : {} });
        for (const monitor of monitors) {
            this.ctx.db.monitor.update({ _id: monitor._id }, {
                $set: {
                    ...name && name !== 'del' && { name: name.replace(/\[(.+?)]/g, (_, key) => monitor[key]) },
                    ...group && group !== 'del' && {
                        group: group.replace(/\[(.+?)]/g, (_, key) => {
                            key = key.split(':');
                            if (key.length === 1) return monitor[key[0]];
                            if (!(monitor[key[0]] ?? '')) return '';
                            if ((monitor[key[0]] ?? '').length <= key[1]) return monitor[key[0]];
                            return monitor[key[0]].substring(0, key[1]);
                        }),
                    },
                    ...camera && camera !== 'del' && { camera: camera.replace(/\[(.+?)]/g, (_, key) => monitor[key]) },
                    ...desktop && desktop !== 'del' && { desktop: desktop.replace(/\[(.+?)]/g, (_, key) => monitor[key]) },
                },
                $unset: {
                    ...name === 'del' && { name: '' },
                    ...group === 'del' && { group: '' },
                    ...camera === 'del' && { camera: '' },
                    ...desktop === 'del' && { desktop: '' },
                },
            });
        }
        this.response.body = { success: true };
    }
}

async function saveMonitorInfo(ctx: Context, monitor: any) {
    const {
        mac, version, uptime, seats, ip,
        os, kernel, cpu, cpuused, mem, memused, load,
        wifi_signal, wifi_bssid,
    } = monitor;
    const monitors = await ctx.db.monitor.find({ mac });
    const warn = monitors.length > 1 || (monitors.length && monitors[0].ip !== ip);
    if (warn) ctx.logger('monitor').warn(`Duplicate monitor ${mac} from (${ip}, ${monitors.length ? monitors[0].ip : 'null'})`);
    const hasWifiSignal = wifi_signal !== undefined && wifi_signal !== '';
    const wifiSignalValue = hasWifiSignal ? Number.parseFloat(String(wifi_signal)) : Number.NaN;
    const normalizedBssid = typeof wifi_bssid === 'string' ? wifi_bssid.trim() : '';
    const shouldSetBssid = normalizedBssid && !/^not-?associated$/i.test(normalizedBssid);
    const setPayload: Record<string, any> = {
        mac,
        ip,
        version,
        uptime,
        hostname: seats,
        oldMonitor: true,
        updateAt: new Date().getTime(),
        ...os && { os },
        ...kernel && { kernel },
        ...cpu && { cpu: cpu.replaceAll('_', ' ') },
        ...cpuused && { cpuUsed: cpuused },
        ...mem && { mem },
        ...mem && { memUsed: memused },
        ...load && { load },
        ...(hasWifiSignal && !Number.isNaN(wifiSignalValue) && { wifiSignal: wifiSignalValue }),
        ...(shouldSetBssid && { wifiBssid: normalizedBssid.toUpperCase() }),
    };
    const unsetPayload: Record<string, 1> = {};
    if (!hasWifiSignal || Number.isNaN(wifiSignalValue)) unsetPayload.wifiSignal = 1;
    if (!shouldSetBssid) unsetPayload.wifiBssid = 1;
    const updateDoc: Record<string, any> = { $set: setPayload };
    if (Object.keys(unsetPayload).length) updateDoc.$unset = unsetPayload;
    await ctx.db.monitor.updateOne({ mac }, updateDoc, { upsert: true });
}

export const Config = Schema.object({
    timeSync: Schema.boolean().default(false),
});

export async function apply(ctx: Context, config: ReturnType<typeof Config>) {
    class MonitorReportHandler extends Handler {
        async get() {
            this.response.body = 'Monitor server is running';
        }

        async post(params) {
            if (!params.mac) throw new BadRequestError();
            params.ip = this.request.ip.replace('::ffff:', '');
            if (params.mac === '00:00:00:00:00:00') throw new BadRequestError('Invalid MAC address');
            await saveMonitorInfo(this.ctx, params);
            this.response.body = `#!/bin/bash\n${config.timeSync ? `date "${new Date().toISOString()}"` : 'echo Success'}`;
        }
    }
    ctx.Route('monitor_report', '/report', MonitorReportHandler);
    ctx.Route('monitor_admin', '/monitor', MonitorAdminHandler);
}
