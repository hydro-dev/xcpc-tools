import fs from 'node:fs';
import path from 'node:path';
import * as yaml from 'js-yaml';
import { exitWithError } from './fail';

export interface ProbeResult {
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

export function resolveConfigPath(): ProbeResult {
    if (process.argv.includes('--no-config')) return { configPath: null };
    const fromCwd = lookAround(process.cwd());
    if (fromCwd) return { configPath: fromCwd };
    const execDir = path.dirname(process.execPath);
    const execIsNode = path.basename(process.execPath).replace('.exe', '').toLowerCase() === 'node';
    if (!execIsNode) {
        const fromExec = lookAround(execDir);
        if (fromExec) return { configPath: fromExec };
    }
    const fromBundle = lookAround(__dirname);
    if (fromBundle) return { configPath: fromBundle };
    const root = packageRoot(__dirname);
    if (root) {
        const fromRoot = lookAround(root);
        if (fromRoot) return { configPath: fromRoot };
    }
    return { configPath: null };
}

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
