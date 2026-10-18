import { Context } from 'cordis';
import { randomstring } from '../utils';
import { createMetricsRegistry } from '../utils';
import { RosterService } from '../service/presentationRoster';

const PRESENTATION_ONLINE_WINDOW = 120_000;

export async function apply(ctx: Context) {
    await ctx.plugin(RosterService);
    const presentationConnections = new Map<string, number>();
    ctx.provide('presentation', {
        touch: (device: string, at: number) => presentationConnections.set(device, at),
        connectedDevices: (now: number) => {
            for (const [device, lastConnectedAt] of presentationConnections) {
                if (lastConnectedAt <= now - PRESENTATION_ONLINE_WINDOW) presentationConnections.delete(device);
            }
            return presentationConnections.size;
        },
    });
    ctx.provide('misc', { randomHash: randomstring(8).toLowerCase() });
    ctx.provide('fetcherStatus', {
        connected: false,
        sourceSuccessAt: 0,
        sourceErrorAt: 0,
        sourceError: '',
    });
    ctx.on('fetcher/status', (status) => Object.assign(ctx.get('fetcherStatus'), status));
    createMetricsRegistry(ctx);
}
