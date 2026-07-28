export interface NetworkInterfaceInfo {
    dev: string;
    mac: string;
    ipv4: string[];
    ipv6: string[];
    isDefault?: boolean;
}

export interface MachineSnapshot {
    mac: string;
    hostname: string;
    ip: string;
    version: string;
    uptime: number;
    os: string;
    kernel: string;
    cpu: string;
    cpuUsed?: number;
    memory: number;
    memoryUsed?: number;
    memoryAvailable?: number;
    swapMemory?: number;
    swapAvailable?: number;
    load?: string;
    imageVersion?: string;
    displays?: string;
    wifiSignal?: number;
    wifiBssid?: string;
    windowName?: string;
    windowExe?: string;
    windowCommand?: string;
    networks: NetworkInterfaceInfo[];
}

/**
 * `installed` means the unit file is present but systemd cannot report its runtime state, which is
 * the case whenever there is no running manager to ask.
 */
export type ProbeServiceState =
    | 'active' | 'activating' | 'inactive' | 'failed' | 'installed' | 'not-found' | 'unknown';

export interface MachineToolsConfig {
    seat?: string;
    serverUrl?: string;
    heartbeatUrl?: string;
    probeUrl?: string;
    presentationUrl?: string;
    reportToken?: string;
    probeEnabled?: boolean;
}

export interface PresentationData {
    contest: { id: string; name: string; startAt: number | null; endAt: number | null };
    teams: number;
    schools: number;
    connected: boolean;
    clientIp: string;
    serverTime: number;
    team: { name: string; school: string; seat: string; logo: string; logoCandidates?: string[] } | null;
    updatedAt: number;
}

export interface PresentationCacheDocument {
    version: 1;
    savedAt: number;
    presentationUrl: string;
    seat: string;
    clockOffset: number;
    data: PresentationData;
}
