declare module 'cordis' {
    interface Context {
        params: any;
        fetcher: any;
    }
    interface Events {
        'app/started': () => void
        'app/ready': () => VoidReturn
        'app/exit': () => VoidReturn
        'notifier/balloonTask': (balloons: BalloonDoc[], source: BalloonNotificationSource) => VoidReturn
    }
}

export type VoidReturn = Promise<any> | any;

export interface PrintCodeDoc {
    _id: string;
    id?: string;
    tid: string;
    team: string;
    location: string;
    filename: string;
    lang: string;
    printer: string;
    createAt: number;
    done?: number;
    receivedAt?: number;
    doneAt?: number;
    remoteDoneAt?: number;
    code?: string;
    group?: string;
    targetPrinter?: string;
}

export interface MonitorDoc {
    _id: string;
    mac: string;
    version: string;
    uptime: number;
    hostname: string;
    ip: string;
    updateAt: number;
    // new version collect
    name?: string;
    group?: string;
    os?: string;
    kernel?: string;
    cpu?: string;
    cpuUsed?: number;
    memory?: string;
    memoryUsed?: number;
    camera?: string;
    desktop?: string;
    wifiSignal?: number;
    wifiBssid?: string;
    windowName?: string;
    windowExe?: string;
    windowCommand?: string;
}

export interface CommandTask {
    _id: string;
    time: number;
    command: string;
    target: string[];
    pending: string[];
    executionResult: Record<string, string>;
}

export interface ClientDoc {
    _id: string;
    id: string;
    name: string;
    type: Array<'printer' | 'balloon'>;
    configured?: boolean;
    group?: string[];

    // for print client
    printers?: string[];
    printersInfo?: any[];
    updateAt?: number;
    ip?: string;
}

export interface BalloonNotificationSource {
    name: string;
    force?: boolean;
    retryFailed?: boolean;
}

export interface BalloonDoc {
    _id: string;
    balloonid: string;
    time: number;
    problem: string;
    contestproblem: any;
    team: string;
    teamid: string;
    location: string;
    awards: string;
    done: boolean;
    printDone: boolean;
    receivedAt?: number;
    printAt?: number;
    notifierSent?: Record<string, number>;
    notifierPending?: boolean;
    notifierFailed?: boolean;
    notifierSource?: string;
    printClient?: string;
    printLeaseExpiresAt?: number | null;
}

export interface TeamDoc {
    _id: string;
    id: string;
    organization_id: string;
    hidden: boolean;
    group_ids: string[];
    affiliation: string;
    name: string;
    display_name: string;
    public_description: string;
    romm: string;
    school?: string;
    logo?: string;
}
