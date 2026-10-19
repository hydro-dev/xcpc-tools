import { parse, stringify } from 'yaml';
import { runPrivileged, writePrivilegedFile } from './privileged';
import type { QuickNetworkConfig } from './quickConfig';

export const NETWORK_OVERRIDE_PATH = '/etc/netplan/99-hydro-machine-setup.yaml';

export interface NetworkTarget {
    kind: 'ethernets' | 'wifis';
    id: string;
    device: NetworkDevice;
    blocked?: string;
    uuid: string;
}

export interface NetworkDevice {
    name: string;
    kind: 'ethernets' | 'wifis';
    mac: string;
    ipv4: string[];
    isDefault: boolean;
}

export interface NetworkConfig {
    before: string;
    targets: NetworkTarget[];
}

export interface NetworkPreview {
    before: string;
    yaml: string;
    target: NetworkTarget;
}

export function discoverNetworkTargets(merged: string, devices: NetworkDevice[], connections: string): NetworkTarget[] {
    const { network } = parse(merged);
    const profiles = new Map<string, { uuid: string, file: string }>();
    for (const line of connections.trim().split('\n')) {
        const [names, uuid, ...path] = line.split(':');
        for (const name of names.split(',')) profiles.set(name.trim(), { uuid, file: path.join(':') });
    }
    const targets = devices.map((device): NetworkTarget => {
        const { kind } = device;
        const profile = profiles.get(device.name);
        const definitions: Record<string, any> = network[kind] || {};
        // NM reports the active keyfile. Match its Netplan ID, without interpreting match rules.
        const file = profile?.file.startsWith('/run/NetworkManager/system-connections/netplan-')
            ? decodeURIComponent(profile.file) : '';
        const source = Object.entries(definitions).find(([id, value]) => {
            const names = kind === 'wifis' ? Object.keys(value['access-points'] || {}).map((ssid) => `${id}-${ssid}`) : [id];
            return names.some((name) => file === `/run/NetworkManager/system-connections/netplan-${name}.nmconnection`);
        });
        const id = kind === 'ethernets' ? device.name : source?.[0] || '';
        let blocked = '';
        if (kind === 'wifis' && !source) blocked = '请先连接由 Netplan 配置的比赛 Wi-Fi，再重新读取网络';
        if (kind === 'ethernets' && profile && !source) blocked = '当前有线连接不是 Netplan 配置，请先检查网络设置';
        return { kind, id, device, blocked, uuid: profile?.uuid || '' };
    });
    for (const target of targets) {
        if (target.kind === 'wifis' && targets.filter((entry) => entry.kind === 'wifis' && entry.id === target.id).length > 1) {
            target.blocked = '多张 Wi-Fi 网卡正在使用同一配置，请先确认比赛 Wi-Fi 连接';
        }
    }
    return targets;
}

export function renderNetworkOverride(before: string, network: QuickNetworkConfig, target: NetworkTarget) {
    if (target.blocked) throw new Error(target.blocked);
    const { network: netplan } = parse(before);
    const definitions = netplan[target.kind] ||= {};
    // A new wired profile must take precedence over the image's catch-all DHCP profile.
    const current = definitions[target.id] ||= {
        dhcp4: true,
        networkmanager: { passthrough: { 'connection.autoconnect-priority': '100' } },
    };
    if (target.kind === 'wifis') current.match = { ...current.match, name: target.device.name };
    if (network.ip) {
        const addresses: string[] = current.addresses || [];
        current.dhcp4 = false;
        current.addresses = [network.ip, ...addresses.filter((value) => value.includes(':'))];
        const routes: { to: string, via?: string }[] = current.routes || [];
        const remaining = routes.filter((route) => !(['default', '0.0.0.0/0'].includes(route.to) && !String(route.via || '').includes(':')));
        current.routes = [...remaining, { to: 'default', via: network.gateway }];
    }
    if (network.dns) {
        current.nameservers = { ...current.nameservers, addresses: network.dns };
        if (current.dhcp4 !== false) {
            current.networkmanager ||= {};
            current.networkmanager.passthrough = { ...current.networkmanager.passthrough, 'ipv4.ignore-auto-dns': 'true' };
        }
    }
    // Retain earlier scans, leaving DHCP defaults and Wi-Fi credentials in the image's files.
    const override: Record<string, any> = { version: 2 };
    for (const kind of ['ethernets', 'wifis']) {
        const entries: Record<string, any> = netplan[kind] || {};
        for (const [id, value] of Object.entries(entries)) {
            if (!value.addresses && !value.routes && !value.nameservers) continue;
            override[kind] ||= {};
            override[kind][id] = Object.fromEntries(
                ['match', 'dhcp4', 'addresses', 'routes', 'nameservers', 'networkmanager']
                    .filter((key) => value[key] !== undefined).map((key) => [key, value[key]]),
            );
        }
    }
    return { yaml: stringify({ network: override }) };
}

export function parseNetworkDevices(addresses: string, routes: string, types: string): NetworkDevice[] {
    const kinds = new Map(types.trim().split('\n').map((line) => line.split(':')) as [string, string][]);
    const defaults = new Set((JSON.parse(routes) as { dev?: string }[]).map((route) => route.dev));
    return (JSON.parse(addresses) as {
        ifname: string; address: string; permaddr?: string; master?: string;
        linkinfo?: { info_kind: string }; addr_info: { family: string, local: string, prefixlen: number }[];
    }[]).filter((entry) => ['ethernet', 'wifi'].includes(kinds.get(entry.ifname) || '')
        && !entry.master && !entry.linkinfo && /^[\w.-]+$/.test(entry.ifname)
        && /^(?:[\da-f]{2}:){5}[\da-f]{2}$/i.test(entry.permaddr || entry.address)).map((entry) => ({
        name: entry.ifname, kind: kinds.get(entry.ifname) === 'wifi' ? 'wifis' : 'ethernets',
        mac: entry.permaddr || entry.address,
        ipv4: entry.addr_info.filter((addr) => addr.family === 'inet').map((addr) => `${addr.local}/${addr.prefixlen}`),
        isDefault: defaults.has(entry.ifname),
    }));
}

export async function readNetworkConfig(): Promise<NetworkConfig> {
    const [merged, addresses, routes, types, connections] = await Promise.all([
        runPrivileged('pkexec', ['/usr/sbin/netplan', 'get']),
        runPrivileged('ip', ['--json', '--details', 'address']),
        runPrivileged('ip', ['--json', '-4', 'route', 'show', 'default']),
        runPrivileged('env', ['LC_ALL=C', 'nmcli', '-t', '-f', 'DEVICE,TYPE', 'device', 'status']),
        runPrivileged('env', ['LC_ALL=C', 'nmcli', '-t', '--escape', 'no', '-f', 'DEVICE,UUID,FILENAME', 'connection', 'show', '--active']),
    ]);
    return { before: merged.stdOut, targets: discoverNetworkTargets(merged.stdOut,
        parseNetworkDevices(addresses.stdOut, routes.stdOut, types.stdOut), connections.stdOut) };
}

function requireTarget(config: NetworkConfig, target: NetworkTarget) {
    const current = config.targets.find((entry) => entry.kind === target.kind && entry.id === target.id
        && entry.device.name === target.device.name && entry.device.mac === target.device.mac);
    if (!current || current.uuid !== target.uuid || current.blocked) {
        throw new Error('所选网卡或当前连接已变化，请重新读取网络并确认');
    }
}

export function previewNetwork(config: NetworkConfig, network: QuickNetworkConfig, target: NetworkTarget): NetworkPreview {
    return { before: config.before, ...renderNetworkOverride(config.before, network, target), target };
}

export async function applyNetwork(preview: NetworkPreview) {
    const current = await readNetworkConfig();
    requireTarget(current, preview.target);
    if (current.before !== preview.before) throw new Error('Netplan 配置已变化，请重新读取后确认');
    await writePrivilegedFile(NETWORK_OVERRIDE_PATH, preview.yaml);
    try {
        await runPrivileged('pkexec', ['/usr/sbin/netplan', 'apply']);
    } catch (error) {
        throw new Error(`覆盖文件已写入，但网络应用失败：${(error as Error).message}`);
    }
}
