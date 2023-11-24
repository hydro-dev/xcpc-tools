import * as cordis from 'cordis';

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

declare global {
    namespace NodeJS {
        interface Global {
            Tools: Tools,
            Contest: {
                info: any,
                id: string,
                name: string,
                teams: any[],
                balloons: any[],
                todoBalloons: any[],
            },
        }
    }
}
