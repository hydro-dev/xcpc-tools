import { createHash } from 'node:crypto';

export type ClientService = 'print' | 'balloon';
export type ClientTaskStage = 'received' | 'converting' | 'printing' | 'confirming' | 'done' | 'failed';

interface ClientTaskStatus {
    id: string;
    label: string;
    stage: ClientTaskStage;
    printer?: string;
    error?: string;
    updatedAt: number;
}

interface ClientConnectionStatus {
    connected: boolean;
    lastConnectedAt: number;
    lastError: string;
}

const MAX_HISTORY = 100;

const state = {
    startedAt: Date.now(),
    identity: '',
    services: [] as ClientService[],
    server: '',
    connections: {
        print: { connected: false, lastConnectedAt: 0, lastError: '' } as ClientConnectionStatus,
        balloon: { connected: false, lastConnectedAt: 0, lastError: '' } as ClientConnectionStatus,
    },
    printers: [] as Array<{ printer: string; status?: string; description?: string; enabled?: boolean }>,
    current: { print: [] as ClientTaskStatus[], balloon: [] as ClientTaskStatus[] },
    history: { print: [] as ClientTaskStatus[], balloon: [] as ClientTaskStatus[] },
};

const sanitizedServer = (server: unknown) => {
    try {
        const url = new URL(String(server || ''));
        return `${url.protocol}//${url.host}${url.pathname}`;
    } catch {
        return '';
    }
};

const sanitizedError = (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error ?? '');
    return message
        .replace(/(^|\/)client\/[^/\s]+\//g, '$1client/[redacted]/')
        .replace(/([?&](?:token|key|secret|password)=)[^&\s]+/gi, '$1[redacted]')
        .slice(0, 500);
};

export function initializeClientStatus(server: unknown, token?: unknown, services: ClientService[] = []) {
    state.server = sanitizedServer(server);
    state.identity = token
        ? `client-${createHash('sha256').update(String(token)).digest('hex').slice(0, 10)}`
        : 'unconfigured-client';
    state.services = [...new Set(services)];
}

export function setClientConnection(service: ClientService, connected: boolean, error?: unknown) {
    const connection = state.connections[service];
    connection.connected = connected;
    if (connected) {
        connection.lastConnectedAt = Date.now();
        connection.lastError = '';
    } else if (error) connection.lastError = sanitizedError(error);
}

export function setPrinterStatus(printersInfo: any[], enabled: string[]) {
    state.printers = (printersInfo || []).map((item) => ({
        printer: String(item.printer || ''),
        status: item.status ? String(item.status) : undefined,
        description: item.description ? String(item.description) : undefined,
        enabled: enabled.includes(item.printer),
    }));
}

export function updateClientTask(
    service: ClientService,
    id: unknown,
    label: unknown,
    stage: ClientTaskStage,
    details: { printer?: string; error?: unknown } = {},
) {
    const taskId = String(id);
    const existing = state.current[service].find((item) => item.id === taskId);
    const next: ClientTaskStatus = {
        id: taskId,
        label: String(label || taskId),
        stage,
        printer: details.printer || existing?.printer,
        error: details.error ? sanitizedError(details.error) : undefined,
        updatedAt: Date.now(),
    };
    state.current[service] = [...state.current[service].filter((item) => item.id !== taskId), next];
    if (stage === 'done' || stage === 'failed') {
        state.current[service] = state.current[service].filter((item) => item.id !== taskId);
        state.history[service] = [next, ...state.history[service]].slice(0, MAX_HISTORY);
    }
}

export function getClientStatus() {
    return JSON.parse(JSON.stringify({
        ...state,
        uptime: Date.now() - state.startedAt,
        queue: {
            print: state.current.print.length,
            balloon: state.current.balloon.length,
            completedPrint: state.history.print.filter((task) => task.stage === 'done').length,
            completedBalloon: state.history.balloon.filter((task) => task.stage === 'done').length,
        },
    }));
}
