import { Context } from 'cordis';
import {
    collectDefaultMetrics, Counter, Gauge, Metric, Registry,
} from 'prom-client';

declare module 'cordis' {
    interface Context {
        metrics: Registry;
    }
    interface Events {
        'print/newTask': (count: number) => void;
        'print/sendTask': (client: string) => void;
        'print/doneTask': (client: string, printer: string) => void;
        'balloon/newTask': (count: number) => void;
        'balloon/sendTask': (client: string, count: number) => void;
        'balloon/doneTask': (client: string, count: number) => void;
    }
}

export function createMetricsRegistry(ctx: Context) {
    const registry = new Registry();

    function createMetric<Q extends string, T extends (new (a: any) => Metric<Q>)>(
        C: T, name: string, help: string, extra?: T extends new (a: infer R) => any ? Partial<R> : never,
    ): T extends (new (a) => Gauge<Q>) ? Gauge<Q> : T extends (new (a) => Counter<Q>) ? Counter<Q> : Metric<Q> {
        const metric = new C({ name, help, ...(extra || {}) });
        registry.registerMetric(metric);
        return metric as any;
    }

    createMetric(Gauge, 'xcpc_machinecount', 'machinecount', {
        labelNames: ['status'],
        async collect() {
            const machines = await ctx.db.monitor.find({});
            const onlines = machines.filter((m) => m.updateAt > new Date().getTime() - 1000 * 120);
            this.set({ status: 'online' }, onlines.length);
            this.set({ status: 'offline' }, machines.length - onlines.length);
        },
    });

    const printTaskCounter = createMetric(Counter, 'xcpc_printcount', 'printcount', {
        labelNames: ['status', 'client', 'printer'],
    });
    ctx.on('print/newTask', (count) => printTaskCounter.inc({ status: 'new' }, count));

    ctx.on('print/sendTask', (client) => printTaskCounter.inc({ status: 'sent', client }));

    ctx.on('print/doneTask', (client, printer) => printTaskCounter.inc({ status: 'done', client, printer }));

    const balloonTaskCounter = createMetric(Counter, 'xcpc_ballooncount', 'ballooncount', {
        labelNames: ['status', 'client'],
    });
    ctx.on('balloon/newTask', (count) => balloonTaskCounter.inc({ status: 'new' }, count));

    ctx.on('balloon/sendTask', (client, count) => balloonTaskCounter.inc({ status: 'sent', client }, count));

    ctx.on('balloon/doneTask', (client, count) => balloonTaskCounter.inc({ status: 'done', client }, count));

    collectDefaultMetrics({ register: registry });

    ctx.provide('metrics', registry);
    return registry;
}
