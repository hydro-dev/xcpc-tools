import fs from 'node:fs';
import path from 'node:path';
import * as yaml from 'js-yaml';
import { exitWithError } from './fail';

export interface ProbeResult {
    /** absolute path of the located config file, or null for builtin boot */
    configPath: string | null;
}

const isClient = () => process.argv.includes('--client');

function configNames() {
    return isClient() ? ['cordis.client.yml', 'cordis.client.yaml'] : ['cordis.yml', 'cordis.yaml'];
}

function lookAround(dir: string): string | null {
    for (const name of configNames()) {
        const candidate = path.join(dir, name);
        if (fs.existsSync(candidate)) return candidate;
    }
    return null;
}

function packageRoot(start: string): string | null {
    let current = start;
    // eslint-disable-next-line no-constant-condition
    while (true) {
        if (fs.existsSync(path.join(current, 'package.json'))) return current;
        const parent = path.dirname(current);
        if (parent === current) return null;
        current = parent;
    }
}

/**
 * Probe chain (rev.4): cwd → execPath dir (only when not plain node, i.e.
 * pkg/SEA bundles) → bundle dir → package root. First hit wins; a corrupted
 * hit is fatal (handled by prevalidate) instead of falling through.
 * `--config` / XCPC_CONFIG are intentionally NOT supported (rev.4 boundary ②).
 */
export function resolveConfigPath(): ProbeResult {
    if (process.argv.includes('--no-config')) return { configPath: null };
    // 1. current working directory
    const fromCwd = lookAround(process.cwd());
    if (fromCwd) return { configPath: fromCwd };
    // 2. directory of the running executable, but only for packaged binaries
    //    (pkg / SEA set execPath to the binary itself; plain `node` would probe
    //    the node installation dir, which is never a config location)
    const execDir = path.dirname(process.execPath);
    const execIsNode = path.basename(process.execPath).replace('.exe', '').toLowerCase() === 'node';
    if (!execIsNode) {
        const fromExec = lookAround(execDir);
        if (fromExec) return { configPath: fromExec };
    }
    // 3. directory of the bundle entry (index.ts in dev, dist/xcpc-tools.js in prod)
    const fromBundle = lookAround(__dirname);
    if (fromBundle) return { configPath: fromBundle };
    // 4. package root
    const root = packageRoot(__dirname);
    if (root) {
        const fromRoot = lookAround(root);
        if (fromRoot) return { configPath: fromRoot };
    }
    return { configPath: null };
}

/**
 * Host-side prevalidation (rev.5 §liveness layer 1): fast-fail with a friendly
 * message before the loader is even started. Deeper failures (missing plugin
 * files, apply errors, unmet injects) are caught by the liveness check.
 */
export function prevalidateYml(configPath: string): void {
    let content: string;
    try {
        content = fs.readFileSync(configPath, 'utf8');
    } catch (error: any) {
        exitWithError(`Failed to read ${configPath}: ${error.message}`);
    }
    let data: any;
    try {
        data = yaml.load(content);
    } catch (error: any) {
        const mark = error.mark ? ` (line ${error.mark.line + 1}, column ${error.mark.column + 1})` : '';
        exitWithError(`Invalid YAML in ${configPath}${mark}: ${error.reason ?? error.message}`);
    }
    if (!Array.isArray(data)) {
        exitWithError(`Invalid config ${configPath}: top level must be an array of entries`);
    }
    validateEntries(configPath, data);
}

// A leaf entry needs a "name". Groups are NOT supported by this host: the
// loader would need the @cordisjs/plugin-group wiring and the repo has no
// consumer for nested grouping, so reject with a readable message instead of
// letting the loader crash on `undefined.startsWith` (review §3.4).
function validateEntries(configPath: string, entries: any[], prefix = ''): void {
    for (const [index, entry] of entries.entries()) {
        const where = `${configPath}: entry #${index + 1}${prefix}`;
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
            exitWithError(`Invalid config ${where} must be an object`);
        }
        if (entry.group) {
            // eslint-disable-next-line max-len
            exitWithError(`Invalid config ${where} is a group entry; groups are not supported — list the entries at the top level instead`);
        }
        if (typeof entry.name !== 'string' || !entry.name) {
            exitWithError(`Invalid config ${where} is missing a "name" field`);
        }
    }
}
