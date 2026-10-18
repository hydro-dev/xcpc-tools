import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Context, FiberState } from 'cordis';
import Loader, { Entry, ModuleLoader } from '@cordisjs/plugin-loader';
import Include from '@cordisjs/plugin-include';
import { BUILTINS } from './builtin';
import { exitWithError } from './fail';

ModuleLoader.fromInternal = () => undefined;

class HostInclude extends Include {
    override import(name: string, getOuterStack?: () => string[]): any {
        if (name.startsWith('xcpc:')) {
            const builtin = BUILTINS[name.slice(5)];
            if (!builtin) throw new Error(`Unknown builtin plugin: ${name}`);
            return builtin;
        }
        return super.import(name, getOuterStack);
    }
}

export function builtinTable() {
    return {
        include: HostInclude,
        ...BUILTINS,
    };
}

export async function startFromConfig(ctx: Context, configPath: string) {
    const baseUrl = pathToFileURL(path.dirname(configPath) + path.sep).href;
    await ctx.plugin(Loader, { baseUrl });
    ctx.loader.builtins = { ...ctx.loader.builtins, ...builtinTable() };
    await ctx.loader.create({
        name: 'cordis:include',
        config: { path: configPath },
    });
    await ctx.loader.await();
}

export function livenessCheck(ctx: Context, configPath: string): void {
    const problems: string[] = [];
    for (const entry of loaderEntries(ctx)) {
        if (entry.options.name === 'cordis:include' && entry.fiber?.state !== FiberState.FAILED) continue;
        if (entry.disabled) continue;
        if (!entry.fiber) {
            problems.push(`${entry.id} (${entry.options.name}): failed to load module`);
        } else if (entry.fiber.state === FiberState.FAILED) {
            const message = String((entry.fiber as any)._error?.message ?? '').split('\n')[0];
            problems.push(`${entry.id} (${entry.options.name}): ${message || 'failed to start'}`);
        } else if (entry.fiber.state === FiberState.PENDING) {
            problems.push(`${entry.id} (${entry.options.name}): dependencies not satisfied (unmet inject)`);
        }
    }
    if (problems.length) {
        exitWithError([`Failed to load plugins from ${configPath}:`, ...problems.map((p) => `  - ${p}`)]);
    }
}

function loaderEntries(ctx: Context): Iterable<Entry> {
    return ctx.loader?.entries() ?? [];
}
