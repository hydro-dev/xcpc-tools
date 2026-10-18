import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Context, FiberState } from 'cordis';
import Loader, { Entry, ModuleLoader } from '@cordisjs/plugin-loader';
import Include from '@cordisjs/plugin-include';
import { BUILTINS } from './builtin';
import { exitWithError } from './fail';

// ---------------------------------------------------------------------------
// Host-side loader compatibility layer.
//
// Deliberate deviation from rev.4 (validated in the rev.5 spike and by the
// branch review): rev.4 proposed subclassing Loader and overriding `import`,
// but `import` is a method of EntryTree, not Loader — a Loader subclass
// override never sees yml-driven entries. Instead the `xcpc:` scheme is
// routed through an Include subclass registered as the loader's `include`
// builtin, which IS the class used to import every entry declared in a yml
// (nested includes included, because child `cordis:include` entries resolve
// via ctx.loader.builtins['include']).
//
// The Loader itself is NOT subclassed — rc.8 needs no overrides (baseUrl
// comes from the constructor config, the builtins registry is native).
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
//   native rc.8 behavior, zero code needed here; bare package names go
//   through createResolve, which needs a node_modules scope and therefore
//   only works in dev installs — documented in cordis.example.yml).
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

/**
 * Start the host loader rooted at the given config file.
 * Returns once every entry fiber has settled; combine with livenessCheck()
 * (below) for the failure gate — loader.await() resolves via allSettled and
 * never rejects, so a failed entry does NOT reject this promise.
 */
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

// [3] Liveness check (rev.5 §liveness layer 2). loader.await() resolves via
//   allSettled and never rejects — failures only land in the logger while the
//   process would happily exit 0. The host must therefore inspect every entry
//   fiber explicitly:
//     !entry.fiber                → import itself failed (module not found...),
//                                   unless the entry is disabled (loader never
//                                   inits disabled entries — review §3.1)
//     fiber.state === FAILED      → apply threw / nested include file broken
//     fiber.state === PENDING     → declared injects can never be satisfied
//   `entry.disabled` walks the parent chain natively, so a group-level
//   `disabled: true` also exempts child entries (defensive; groups are
//   rejected by prevalidate today).
export function livenessCheck(ctx: Context, configPath: string): void {
    const problems: string[] = [];
    for (const entry of loaderEntries(ctx)) {
        // include entries are structural (they expand into child entries):
        // a healthy one owns no fiber state worth checking — its children are
        // visited in this same iteration. But a FAILED include means the
        // referenced yml itself could not be read/parsed/validated, which
        // must abort startup, so only skip non-failed includes.
        if (entry.options.name === 'cordis:include' && entry.fiber?.state !== FiberState.FAILED) continue;
        if (entry.disabled) continue;
        if (!entry.fiber) {
            problems.push(`${entry.id} (${entry.options.name}): failed to load module`);
        } else if (entry.fiber.state === FiberState.FAILED) {
            // `_error` is private in the d.ts but present at runtime; it holds
            // the rejection reason of the entry fiber (apply throw /
            // nested-include ConfigFileError)
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

// Known limitation (review §3.2, documented in cordis.example.yml too):
// dependencies declared with ctx.inject() INSIDE apply run on child fibers
// that never appear in loader.entries(), so an unmet there-dependency cannot
// fail this check. Static declarations (plugin `exports.inject` or the yml
// entry `inject:` field) are both covered.
