import { filesystem, os } from '@neutralinojs/lib';

const HELPER_SEARCH_PATHS = [
    '/usr/local/sbin/machine-setup-helper',
    '/usr/local/bin/machine-setup-helper',
    '/usr/sbin/machine-setup-helper',
    '/usr/bin/machine-setup-helper',
    '/opt/machine-setup/machine-setup-helper',
];

let cachedHelperPath: string | null = null;

async function getHelperPath(): Promise<string> {
    if (cachedHelperPath) return cachedHelperPath;
    for (const p of HELPER_SEARCH_PATHS) {
        try {
            const stat = await filesystem.getStats(p);
            if (stat.isFile) {
                cachedHelperPath = p;
                return p;
            }
        } catch { /* not found, try next */ }
    }
    // Fallback: try to find it via `which`
    try {
        const res = await os.execCommand('which machine-setup-helper');
        if (res.exitCode === 0 && res.stdOut.trim()) {
            cachedHelperPath = res.stdOut.trim();
            return cachedHelperPath;
        }
    } catch { /* ignore */ }
    throw new Error(
        `machine-setup-helper not found in any of: ${HELPER_SEARCH_PATHS.join(', ')}`,
    );
}

/**
 * Write content to a privileged file path.
 * Writes content to a temp file first, then uses pkexec + machine-setup-helper
 * to install it to the target path with proper permissions.
 */
export async function writePrivilegedFile(targetPath: string, content: string): Promise<void> {
    const helperPath = await getHelperPath();
    const tmpPath = `/tmp/.machine-setup-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await filesystem.writeFile(tmpPath, content);
    try {
        const res = await os.execCommand(
            `${helperPath} install-file '${tmpPath}' '${targetPath}'`,
        );
        if (res.exitCode !== 0) {
            throw new Error(res.stdErr || `Failed to write ${targetPath}`);
        }
    } catch (e) {
        // Clean up temp file on failure
        try {
            await filesystem.remove(tmpPath);
        } catch { /* ignore cleanup errors */ }
        throw e;
    }
}


