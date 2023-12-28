import * as cordis from 'cordis';
import Datastore from 'nedb-promises';

export interface Events extends cordis.Events<any>, EventMap {
}

export interface Context {
    [Context.events]: Events;
    Route: typeof import('./service/server').Route;
    broadcast: Context['emit'];
}

export class Context extends cordis.Context {
    params: any;
    fetcher: any;
    db: {
        code: Datastore<PrintCodeDoc>;
        monitor: Datastore<MonitorDoc>;
        client: Datastore<ClientDoc>;
    };
}

export type VoidReturn = Promise<any> | any;

export interface EventMap {
    'app/started': () => void
    'app/listen': () => void
    'app/ready': () => VoidReturn
    'app/exit': () => VoidReturn
}

export interface ToolsConfig {
    type: string;
    endpoint: string;
    contestId: string;
    uname: string;
    password: string;
}

export interface Tools {
    config: ToolsConfig;
    version: string;
}

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
    seats: string;
    ip: string;
    updateAt: number;
    // new version collect
    name?: string;
    group?: string;
    os?: string;
    kernel?: string;
    cpu?: string;
    cpuUsage?: number;
    memory?: string;
    memoryUsage?: number;
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
    url?: string;
    template?: string;
}

declare global {
    namespace NodeJS {
        interface Global {
            Tools: Tools,
            Contest: {
                info: any,
                id: string,
                name: string,
            },
        }
    }
}
