import { filesystem, os } from '@neutralinojs/lib';
import { shellQuote } from './system';

const HELPER_SEARCH_PATHS = [
    '/usr/local/sbin/machine-setup-helper',
    '/usr/local/bin/machine-setup-helper',
    '/usr/sbin/machine-setup-helper',
    '/usr/bin/machine-setup-helper',
    '/opt/machine-setup/machine-setup-helper',
];

let cachedHelperPath = '';

async function getHelperPath() {
    if (cachedHelperPath) return cachedHelperPath;
    const candidates = await Promise.all(HELPER_SEARCH_PATHS.map(async (path) => ({
        path,
        stats: await filesystem.getStats(path).catch(() => null),
    })));
    const candidate = candidates.find((item) => item.stats?.isFile);
    if (candidate) {
        cachedHelperPath = candidate.path;
        return cachedHelperPath;
    }
    const result = await os.execCommand('command -v machine-setup-helper');
    if (result.exitCode === 0 && result.stdOut.trim().startsWith('/')) {
        cachedHelperPath = result.stdOut.trim();
        return cachedHelperPath;
    }
    throw new Error(`未找到镜像内置的 machine-setup-helper（已检查 ${HELPER_SEARCH_PATHS.join('、')}）`);
}

export async function runPrivileged(command: string, args: string[] = []) {
    const result = await os.execCommand([command, ...args].map(shellQuote).join(' '));
    if (result.exitCode !== 0) throw new Error(result.stdErr || `${command} 执行失败`);
    return result;
}

export async function writePrivilegedFile(targetPath: string, content: string): Promise<void> {
    const helperPath = await getHelperPath();
    const temporary = `/tmp/.machine-setup-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await filesystem.writeFile(temporary, content);
    try {
        const result = await os.execCommand(
            [helperPath, 'install-file', temporary, targetPath].map(shellQuote).join(' '),
        );
        if (result.exitCode !== 0) throw new Error(result.stdErr || `无法写入 ${targetPath}`);
    } finally {
        await filesystem.remove(temporary).catch(() => undefined);
    }
}

export async function setPrivilegedHostname(hostname: string): Promise<void> {
    const helperPath = await getHelperPath();
    const result = await os.execCommand(
        [helperPath, 'set-hostname', hostname].map(shellQuote).join(' '),
    );
    if (result.exitCode !== 0) throw new Error(result.stdErr || '无法设置主机名');
}
