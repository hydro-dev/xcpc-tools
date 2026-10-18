import { Context } from 'cordis';
import { randomstring } from '../utils';
import { createMetricsRegistry } from '../utils';
import { RosterService } from '../service/presentationRoster';

const PRESENTATION_ONLINE_WINDOW = 120_000;

// Block 4 (singleton collection): presentation connection tracking, the
// metrics registry, the roster service and the static-frontend hash used to
// live in module-level mutable state inside handler/misc.ts. They are now
// context services provided by this base plugin, which handler/misc.ts
// declares as inject dependencies.
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
    // Block 6 (fetcher event-ification): subscribe to the fetcher/status
    // event and keep a local cache so request handlers never reach into the
    // fetcher service directly
    ctx.provide('fetcherStatus', {
        connected: false,
        sourceSuccessAt: 0,
        sourceErrorAt: 0,
        sourceError: '',
    });
    ctx.on('fetcher/status', (status) => Object.assign(ctx.get('fetcherStatus'), status));
    createMetricsRegistry(ctx); // provides ctx.metrics
}
