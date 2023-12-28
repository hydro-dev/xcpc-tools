/* eslint-disable no-await-in-loop */
import http from 'http';
import { BadRequestError } from '../error';
import { Context } from '../interface';
import { Handler } from '../service/server';
import { Logger } from '../utils';
import { AuthHandler } from './misc';

const logger = new Logger('handler/monitor');

class MonitorAdminHandler extends AuthHandler {
    async get() {
        const monitors = await this.ctx.db.monitor.find({}).sort({ group: 1, name: 1 });
        const monitorDict = {};
        const groups = {};
        for (const monitor of monitors) {
            monitorDict[monitor.name || monitor._id] = monitor;
            groups[monitor.group] ||= [];
            groups[monitor.group].push(monitor.name || monitor._id);
        }
        this.response.body = { monitors: monitorDict, groups };
    }

    async postUpdate(params) {
        const { _id, name, group } = params;
        if (!_id) throw new BadRequestError();
        this.ctx.db.monitor.update({ _id }, {
            $set: {
                ...name && { name },
                ...group && { group },
            },
        });
        this.response.body = { success: true };
    }
}

async function saveMonitorInfo(ctx: Context, monitor: any) {
    const {
        mac, version, uptime, seats, ip,
        os, kernel, cpu, cpuUsage, mem, load,
    } = monitor;
    const monitors = await ctx.db.monitor.find({ mac });
    const warn = monitors.length > 1 || (monitors.length && monitors[0].ip !== ip);
    if (warn) logger.warn(`Duplicate monitor ${mac} from (${ip}, ${monitors.length ? monitors[0].ip : 'null'})`);
    await ctx.db.monitor.updateOne({ mac }, {
        $set: {
            mac,
            ip,
            version,
            uptime,
            seats,
            oldMonitor: true,
            updateAt: new Date().getTime(),
            ...os && { os },
            ...kernel && { kernel },
            ...cpu && { cpu: cpu.replaceAll('_', ' ') },
            ...cpuUsage && { cpuUsage },
            ...mem && { mem: mem.split('/')[1] },
            ...mem && { memUsage: mem.split('/')[0] },
            ...load && { load },
        },
    }, { upsert: true });
}

class MonitorReportHandler extends Handler {
    async get() {
        this.response.body = 'Monitor server is running';
    }

    async post(params) {
        if (!params.mac) throw new BadRequestError();
        params.ip = this.request.ip.replace('::ffff:', '');
        await saveMonitorInfo(this.ctx, params);
        this.response.body = 'Monitor server is running';
    }
}

export async function apply(ctx: Context) {
    if (global.Tools.config.oldMonitor) {
        http.createServer((req, res) => {
            const postData = [];
            req.on('data', (chunk) => {
                postData.push(chunk);
            });
            req.on('end', async () => {
                const result: any = {};
                const data = Buffer.concat(postData).toString().split('&');
                for (const item of data) {
                    const [key, value] = item.split('=');
                    result[key] = value;
                }
                result.ip = req.socket.remoteAddress.replace('::ffff:', '');
                if (!result.mac) {
                    res.writeHead(400, { 'Content-Type': 'text/plain' });
                    res.end('Bad Request');
                    return;
                }
                await saveMonitorInfo(ctx, result);
                res.writeHead(200, { 'Content-Type': 'text/plain' });
                res.end('Monitor server is running');
            });
        }).listen(3000);
        logger.info('Monitor forward server start at :3000');
    }
    ctx.Route('monitor_report', '/report', MonitorReportHandler);
    ctx.Route('monitor_admin', '/monitor', MonitorAdminHandler);
}
