import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Context, FiberState } from 'cordis';
import Loader, { Entry, ModuleLoader } from '@cordisjs/plugin-loader';
import Include from '@cordisjs/plugin-include';
import { BUILTINS } from './builtin';

// ---------------------------------------------------------------------------
// Host-side loader compatibility layer (rev.5 §3②).
// Every loader-related hack lives in this file; the Loader itself is NOT
// subclassed — rc.8 needs no overrides (baseUrl comes from the constructor
// config, the builtins registry is native).
// ---------------------------------------------------------------------------

// [1] fromInternal patch
//   Applies to: @cordisjs/plugin-loader@1.0.0-rc.8. Its
//   ModuleLoader.fromInternal() runs createRequire(import.meta.url) at Loader
//   construction time; under the esbuild CJS bundle import.meta.url is
//   undefined → ERR_INVALID_ARG_VALUE, crashing boot before any plugin loads.
//   Enabled: unconditionally (the bundle is the only release form; in dev the
//   internal fast path is never required).
//   Remove when: upstream lazifies / tolerates the failure, or the repo moves
//   to ESM.
ModuleLoader.fromInternal = () => undefined;

// [2] HostInclude: routes the `xcpc:` scheme to the builtin table; everything
//   else goes through Include's native resolution ('./' paths resolve against
//   the baseUrl that Include re-anchors to the declaring yml's directory —
//   native rc.8 behavior, zero code needed here). Nested includes inherit
//   HostInclude automatically because child `cordis:include` entries resolve
//   via ctx.loader.builtins['include'].
class HostInclude extends Include {
    override import(name: string, getOuterStack?: () => string[]): any {
        if (name.startsWith('xcpc:')) return BUILTINS[name.slice(5)];
        return super.import(name, getOuterStack);
    }
}

export function builtinTable() {
    return {
        include: HostInclude,
        ...BUILTINS,
    };
}

/**
 * Start the host loader rooted at the given config file.
 * Returns once every entry fiber has settled; combine with livenessCheck()
 * (below) for the failure gate — loader.await() never rejects.
 */
export async function startFromConfig(ctx: Context, configPath: string) {
    const baseUrl = pathToFileURL(path.dirname(configPath) + path.sep).href;
    await ctx.plugin(Loader, { baseUrl });
    ctx.loader.builtins = { ...ctx.loader.builtins, ...builtinTable() };
    // `create` assigns the id itself (Omit<EntryOptions, 'id'>); the literal
    // keeps the documented 'conf' id so livenessCheck can recognize the entry
    await ctx.loader.create({
        name: 'cordis:include',
        config: { path: configPath },
    } as any);
    await ctx.loader.await();
}

// [3] Liveness check (rev.5 §2.0a layer 2). loader.await() resolves via
//   allSettled and never rejects — failures only land in the logger while the
//   process would happily exit 0. The host must therefore inspect every entry
//   fiber explicitly:
//     !entry.fiber                → import itself failed (module not found...)
//     fiber.state === FAILED      → apply threw / nested include file broken
//     fiber.state === PENDING     → declared injects can never be satisfied
export function livenessCheck(configPath: string): void {
    const problems: string[] = [];
    for (const entry of ctxLoaderEntries()) {
        // skip the root include entry (the yml driver itself); child entries
        // of nested includes are still visited via entries() recursion
        if (entry.options.name === 'cordis:include') continue;
        if (!entry.fiber) {
            problems.push(`${entry.options.id} (${entry.options.name}): failed to load module`);
        } else if (entry.fiber.state === FiberState.FAILED) {
            // `_error` is private in the d.ts but present at runtime; it holds
            // the rejection reason of the entry fiber (apply throw /
            // nested-include ConfigFileError)
            const message = String((entry.fiber as any)._error?.message ?? '').split('\n')[0];
            problems.push(`${entry.options.id} (${entry.options.name}): ${message || 'failed to start'}`);
        } else if (entry.fiber.state === FiberState.PENDING) {
            problems.push(`${entry.options.id} (${entry.options.name}): dependencies not satisfied (unmet inject)`);
        }
    }
    if (problems.length) {
        // eslint-disable-next-line no-console
        console.error(`Failed to load plugins from ${configPath}:`);
        for (const problem of problems) {
            // eslint-disable-next-line no-console
            console.error(`  - ${problem}`);
        }
        process.exit(1);
    }
}

// -- plumbing ---------------------------------------------------------------

let _loaderRef: any = null;

export function registerLoaderRef(ctx: Context) {
    _loaderRef = ctx;
}

function ctxLoaderEntries(): Iterable<Entry> {
    if (!_loaderRef?.loader) return [];
    return _loaderRef.loader.entries();
}

