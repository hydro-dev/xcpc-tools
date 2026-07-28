import { computer, filesystem, os } from '@neutralinojs/lib';
import type {
    MachineSnapshot, MachineToolsConfig, NetworkInterfaceInfo, PresentationCacheDocument,
    ProbeServiceState,
} from '../types';

export const SEAT_CONFIG_PATH = '/var/lib/icpc/config.json';
export const HEARTBEAT_CONFIG_PATH = '/etc/default/icpc-heartbeat';
export const MACHINE_TOOLS_ENV_PATH = '/etc/default/hydro-machine-tools';
export const PROBE_SERVICE_UNIT = 'hydro-machine-tools.service';
export const HEARTBEAT_TIMER_UNIT = 'heartbeat.timer';
export const HEARTBEAT_SERVICE_UNIT = 'heartbeat.service';
export const PRESENTATION_CACHE_PATH = `/tmp/xcpc-tools-presentation-${window.NL_PID || 'session'}.json`;
const PRESENTATION_CACHE_TEMP_PATH = `${PRESENTATION_CACHE_PATH}.tmp`;
let presentationCacheOperation = Promise.resolve<unknown>(undefined);

export interface MachineToolsEndpoints {
    serverUrl: string;
    heartbeatUrl: string;
    probeUrl: string;
    presentationUrl: string;
}

interface IpAddressEntry {
    ifname: string;
    address: string;
    addr_info: Array<{ family: 'inet' | 'inet6'; local: string }>;
}

interface IpRouteEntry {
    dev?: string;
    metric?: number;
}

export function shellQuote(value: string) {
    return `'${value.replace(/'/g, '\'"\'"\'')}'`;
}

const UNIT_STATE_ALIASES: Record<string, ProbeServiceState> = {
    active: 'active',
    reloading: 'active',
    activating: 'activating',
    deactivating: 'inactive',
    inactive: 'inactive',
    failed: 'failed',
};

/**
 * `list-unit-files` is one of the few verbs that still answers without a running manager, so it is
 * the only reliable way to tell a missing unit apart from an unreachable systemd. Online-only verbs
 * such as `show` and `is-active` log "Running in chroot, ignoring command '<verb>'" to stderr and
 * exit 0 with empty stdout when no manager is running, which reads exactly like "not found".
 */
export async function unitFileExists(unit: string) {
    const result = await os.execCommand(
        `systemctl list-unit-files ${shellQuote(unit)} --no-legend --no-pager`,
    ).catch(() => undefined);
    return result?.exitCode === 0 && Boolean(result.stdOut.trim());
}

/** Runtime state of a unit, or an empty string when systemd cannot answer (no running manager). */
export async function getUnitActiveState(unit: string) {
    const result = await os.execCommand(`systemctl is-active ${shellQuote(unit)}`).catch(() => undefined);
    return result?.stdOut.trim() || '';
}

export async function getProbeServiceState(): Promise<ProbeServiceState> {
    try {
        if (!await unitFileExists(PROBE_SERVICE_UNIT)) return 'not-found';
        const state = await getUnitActiveState(PROBE_SERVICE_UNIT);
        // Empty output means there was no manager to ask, not that the unit is missing. Anything
        // else came from a live systemd, so it must not be reported as "no running systemd".
        if (!state) return 'installed';
        return UNIT_STATE_ALIASES[state] || 'unknown';
    } catch {
        return 'unknown';
    }
}

export function isPrivateIPv4(ip: string) {
    const parts = ip.split('.').map(Number);
    return parts[0] === 10
        || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
        || (parts[0] === 192 && parts[1] === 168);
}

export async function readOptionalFile(path: string) {
    try {
        return await filesystem.readFile(path);
    } catch {
        return '';
    }
}

export async function readPresentationCache(): Promise<PresentationCacheDocument | undefined> {
    try {
        const parsed = JSON.parse(await filesystem.readFile(PRESENTATION_CACHE_PATH)) as PresentationCacheDocument;
        return parsed?.version === 1 ? parsed : undefined;
    } catch {
        return undefined;
    }
}

export function writePresentationCache(cache: PresentationCacheDocument) {
    const operation = presentationCacheOperation.catch(() => undefined).then(async () => {
        await filesystem.writeFile(PRESENTATION_CACHE_TEMP_PATH, `${JSON.stringify(cache, null, 2)}\n`);
        try {
            await filesystem.move(PRESENTATION_CACHE_TEMP_PATH, PRESENTATION_CACHE_PATH);
        } finally {
            await filesystem.remove(PRESENTATION_CACHE_TEMP_PATH).catch(() => undefined);
        }
    });
    presentationCacheOperation = operation;
    return operation;
}

export function removePresentationCache() {
    const operation = presentationCacheOperation.catch(() => undefined).then(async () => {
        await filesystem.remove(PRESENTATION_CACHE_PATH).catch(() => undefined);
        await filesystem.remove(PRESENTATION_CACHE_TEMP_PATH).catch(() => undefined);
    });
    presentationCacheOperation = operation;
    return operation;
}

function unwrapConfigValue(value: unknown) {
    if (typeof value !== 'string') return '';
    const trimmed = value.trim();
    const quote = trimmed[0];
    if ((quote === '"' || quote === "'") && trimmed.at(-1) === quote) return trimmed.slice(1, -1).trim();
    return trimmed;
}

export function completeHeartbeatUrl(input: string) {
    const value = input.trim();
    if (!value) throw new Error('请输入心跳上报中心地址');
    if (/^https?:\/\//i.test(value)) return value;
    if (!value.includes(':')) return `http://${value}:5283/report`;
    return `http://${value}/report`;
}

export function deriveServerEndpoints(input: string): MachineToolsEndpoints {
    const heartbeatUrl = completeHeartbeatUrl(input);
    const heartbeat = new URL(heartbeatUrl);
    if (!['http:', 'https:'].includes(heartbeat.protocol) || heartbeat.username || heartbeat.password) {
        throw new Error('心跳上报地址必须是 HTTP 或 HTTPS URL');
    }
    const base = new URL(heartbeat.toString());
    base.search = '';
    base.hash = '';
    base.pathname = base.pathname.replace(/\/report\/?$/, '/') || '/';
    if (!base.pathname.endsWith('/')) base.pathname += '/';
    const probe = new URL('probe', base);
    probe.protocol = probe.protocol === 'https:' ? 'wss:' : 'ws:';
    return {
        serverUrl: base.toString(),
        heartbeatUrl,
        probeUrl: probe.toString(),
        presentationUrl: new URL('presentation', base).toString(),
    };
}

export function heartbeatVersionUrl(heartbeatUrl: string) {
    return heartbeatUrl.includes('/report')
        ? heartbeatUrl.replace('/report', '/version')
        : new URL('version', deriveServerEndpoints(heartbeatUrl).serverUrl).toString();
}

export function parseImageRevision(versionFile: string, commandLine: string) {
    return versionFile.match(/Revision:\s*(\S+)/)?.[1]
        || commandLine.match(/(?:^|\s)version=(\S+)/)?.[1]
        || 'devel';
}

export async function readMachineToolsConfig(): Promise<MachineToolsConfig> {
    const [seatText, heartbeatText, probeText] = await Promise.all([
        readOptionalFile(SEAT_CONFIG_PATH),
        readOptionalFile(HEARTBEAT_CONFIG_PATH),
        readOptionalFile(MACHINE_TOOLS_ENV_PATH),
    ]);
    let seat = '';
    try {
        seat = unwrapConfigValue(JSON.parse(seatText || '{}').seat);
    } catch {
        seat = '';
    }
    const heartbeatUrl = unwrapConfigValue(heartbeatText.match(/^\s*HEARTBEATURL\s*=\s*(.*)$/m)?.[1]);
    const configuredProbeUrl = unwrapConfigValue(probeText.match(/^\s*PROBEURL\s*=\s*(.*)$/m)?.[1]);
    const reportToken = unwrapConfigValue(
        probeText.match(/^\s*REPORTTOKEN\s*=\s*(.*)$/m)?.[1]
        || heartbeatText.match(/^\s*REPORTTOKEN\s*=\s*(.*)$/m)?.[1],
    );
    let endpoints: Partial<MachineToolsEndpoints> = {};
    try {
        if (configuredProbeUrl) {
            const reportUrl = new URL(configuredProbeUrl);
            reportUrl.protocol = reportUrl.protocol === 'wss:' ? 'https:' : 'http:';
            reportUrl.pathname = reportUrl.pathname.replace(/\/probe\/?$/, '/report');
            endpoints = deriveServerEndpoints(reportUrl.toString());
        } else if (heartbeatUrl) {
            endpoints = deriveServerEndpoints(heartbeatUrl);
        }
    } catch {
        endpoints = {};
    }
    return {
        seat,
        serverUrl: endpoints.serverUrl,
        heartbeatUrl: endpoints.heartbeatUrl,
        probeUrl: configuredProbeUrl || endpoints.probeUrl,
        presentationUrl: endpoints.presentationUrl,
        reportToken,
        probeEnabled: Boolean(configuredProbeUrl),
    };
}

export async function getNetworkInfo(): Promise<NetworkInterfaceInfo[]> {
    const [addressResult, routeResult] = await Promise.all([
        os.execCommand('ip --json address'),
        os.execCommand('ip --json route show default').catch(() => undefined),
    ]);
    const entries: IpAddressEntry[] = JSON.parse(addressResult.stdOut || '[]');
    const routes: IpRouteEntry[] = JSON.parse(routeResult?.stdOut || '[]');
    const defaultDevice = routes
        .filter((route) => route.dev)
        .sort((left, right) => (left.metric || 0) - (right.metric || 0))[0]?.dev;
    return entries
        .map((entry) => ({
            dev: entry.ifname,
            mac: entry.address,
            ipv4: entry.addr_info.filter((addr) => addr.family === 'inet').map((addr) => addr.local),
            ipv6: entry.addr_info.filter((addr) => addr.family === 'inet6').map((addr) => addr.local),
            isDefault: entry.ifname === defaultDevice,
        }))
        .filter((entry) => entry.isDefault || entry.ipv4.some(isPrivateIPv4))
        .sort((left, right) => Number(right.isDefault) - Number(left.isDefault));
}

async function getUsage() {
    try {
        const result = await os.execCommand("LC_ALL=C top -bn1 | awk '/Cpu\\(s\\)/ {print 100-$8}' && free -b | awk '/Mem:/ {print $3 \" \" $2}'");
        const [cpuLine = '', memoryLine = ''] = result.stdOut.trim().split('\n');
        const [used, total] = memoryLine.split(/\s+/).map(Number);
        return {
            cpuUsed: Number.isFinite(Number(cpuLine)) ? Number(cpuLine) : undefined,
            memoryUsed: total ? Math.round(used / 1024) : undefined,
        };
    } catch {
        return {};
    }
}

async function getWifiInfo(device?: string) {
    if (!device) return {};
    const iw = await os.execCommand(`iw dev ${shellQuote(device)} link`).catch(() => undefined);
    const iwOutput = iw?.stdOut || '';
    if (/\bConnected to\b/i.test(iwOutput)) {
        const signal = Number(iwOutput.match(/^\s*signal:\s*(-?[0-9.]+)/m)?.[1]);
        return {
            wifiSignal: Number.isFinite(signal) ? signal : undefined,
            wifiBssid: iwOutput.match(/Connected to\s+([0-9a-f:]{17})/i)?.[1]?.toUpperCase(),
        };
    }
    const iwconfig = await os.execCommand(`iwconfig ${shellQuote(device)}`).catch(() => undefined);
    const output = iwconfig?.stdOut || '';
    const signal = Number(output.match(/Signal level[=:]\s*(-?[0-9.]+)/i)?.[1]);
    return {
        wifiSignal: Number.isFinite(signal) ? signal : undefined,
        wifiBssid: output.match(/Access Point:\s*([0-9a-f:]{17})/i)?.[1]?.toUpperCase(),
    };
}

async function getActiveWindowInfo() {
    const sockets = await filesystem.readDirectory('/tmp/.X11-unix').catch(() => []);
    const displays = sockets.map((entry) => entry.entry.match(/^X([0-4])$/)?.[1]).filter(Boolean) as string[];
    const displayChecks = await Promise.all(displays.sort().map(async (candidate) => {
        const result = await os.execCommand(`DISPLAY=:${candidate} xset -q`).catch(() => undefined);
        return { candidate, active: result?.exitCode === 0 };
    }));
    const display = displayChecks.find((candidate) => candidate.active)?.candidate || '';
    if (!display) return { windowExe: 'unknown', windowCommand: 'unknown' };
    const root = await os.execCommand(`DISPLAY=:${display} xprop -root _NET_ACTIVE_WINDOW`).catch(() => undefined);
    const windowId = root?.stdOut.match(/(?:#|=)\s*(0x[0-9a-f]+)/i)?.[1];
    if (!windowId || windowId === '0x0') return { windowExe: 'unknown', windowCommand: 'unknown' };
    const detail = await os.execCommand(
        `DISPLAY=:${display} xprop -notype -id ${windowId} WM_NAME _NET_WM_PID`,
    ).catch(() => undefined);
    const output = detail?.stdOut || '';
    const pid = output.match(/^_NET_WM_PID\s*=\s*(\d+)/m)?.[1];
    const windowName = output.match(/^WM_NAME\s*=\s*"(.*)"$/m)?.[1];
    if (!pid) return { windowName, windowExe: 'unknown', windowCommand: 'unknown' };
    const [windowExe, commandLine] = await Promise.all([
        os.execCommand(`readlink ${shellQuote(`/proc/${pid}/exe`)}`).then((result) => result.stdOut.trim()).catch(() => 'unknown'),
        readOptionalFile(`/proc/${pid}/cmdline`),
    ]);
    return {
        windowName,
        windowExe: windowExe || 'unknown',
        windowCommand: commandLine.replace(/\0/g, ' ').trim() || 'unknown',
    };
}

export async function collectMachineSnapshot(): Promise<MachineSnapshot> {
    const [
        arch, kernel, osInfo, cpu, memory, displays, networks, uptime,
        imageVersion, revisionFile, commandLine,
    ] = await Promise.all([
        computer.getArch(),
        computer.getKernelInfo(),
        computer.getOSInfo(),
        computer.getCPUInfo(),
        computer.getMemoryInfo(),
        computer.getDisplays(),
        getNetworkInfo(),
        os.execCommand('cut -d. -f1 /proc/uptime').then((result) => Number(result.stdOut.trim())).catch(() => 0),
        readOptionalFile('/etc/icpcimage-version'),
        readOptionalFile('/icpc/version'),
        readOptionalFile('/proc/cmdline'),
    ]);
    const primary = networks.find((network) => network.isDefault) || networks[0];
    const [usage, wifi, activeWindow] = await Promise.all([
        getUsage(),
        getWifiInfo(primary?.dev),
        getActiveWindowInfo(),
    ]);
    const totalMemory = Math.round(memory.physical.total / 1024);
    const privateIp = networks.flatMap((network) => network.ipv4).find(isPrivateIPv4) || '';
    return {
        mac: primary?.mac || '00:00:00:00:00:00',
        hostname: await os.execCommand('hostname').then((result) => result.stdOut.trim()).catch(() => ''),
        ip: privateIp,
        version: parseImageRevision(revisionFile, commandLine),
        uptime,
        os: `${osInfo.name} ${osInfo.version} ${arch} - ${osInfo.description}`,
        kernel: `${kernel.variant} ${kernel.version}`,
        cpu: `${cpu.physicalCores}C${cpu.logicalThreads}T ${cpu.architecture} ${cpu.model} ${(cpu.frequency / 1024 / 1024 / 1024).toFixed(2)}GHz`,
        memory: totalMemory,
        memoryAvailable: Math.round(memory.physical.available / 1024),
        swapMemory: Math.round(memory.virtual.total / 1024),
        swapAvailable: Math.round(memory.virtual.available / 1024),
        imageVersion: imageVersion.trim() || 'Unknown',
        displays: displays.map((display) => `${display.resolution.width}x${display.resolution.height}@${display.refreshRate}Hz`).join(', '),
        networks,
        ...usage,
        ...wifi,
        ...activeWindow,
    };
}

export async function commandVersion(command: string, regexp: RegExp) {
    try {
        const result = await os.execCommand(command);
        return (result.stdOut || result.stdErr).match(regexp)?.[0] || 'Not found';
    } catch {
        return 'Not found';
    }
}
