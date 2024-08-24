import { Context } from 'cordis';
import {
    collectDefaultMetrics, Counter, Gauge, Metric, Registry,
} from 'prom-client';

declare module 'cordis' {
    interface Context {
        metrics: Registry;
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
        async collect() {
            this.set({}, await ctx.db.monitor.count({ updateAt: { $gt: new Date().getTime() - 120 * 1000 } }));
        },
    });

    collectDefaultMetrics({ register: registry });

    ctx.set('metrics', registry);
    return registry;
}
