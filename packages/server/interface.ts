declare module 'cordis' {
    interface Context {
        params: any;
        fetcher: any;
    }
    interface Events {
        'app/started': () => void
        'app/ready': () => VoidReturn
        'app/exit': () => VoidReturn
    }
}

export type VoidReturn = Promise<any> | any;

export interface PrintCodeDoc {
    _id: string;
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
    code?: string;
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
}

export interface ClientDoc {
    _id: string;
    id: string;
    name: string;
    type: string;
    subType?: string;
    group?: string[];

    // for print client
    printer?: string[];
    printersInfo?: any[];

    // for ballon client
    token?: string;
    chatId?: string;
    endpoint?: string;
    template?: string;
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
}
