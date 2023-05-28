import * as cordis from 'cordis';

export interface Events<C extends Context = Context> extends cordis.Events<any>, EventMap {
}

export interface Context {
    [Context.events]: Events<Context>;
    Route: typeof import('./service/server').Route;
    broadcast: Context['emit'];
}

export class Context extends cordis.Context {}

export type VoidReturn = Promise<any> | any;

export interface EventMap {
    'app/started': () => void
    'app/listen': () => void
    'app/ready': () => VoidReturn
    'app/exit': () => VoidReturn
}

export interface Udoc {
    id: number
    uname: string
    password: string
    priv: number
    loginat: Date
    loginip: string
}

export interface OrgDoc {
    id: number
    name: string
    fullname: string
    logo: string
}

export interface TeamDoc {
    id: number
    name: string
    fullname: string
    members: string
    seat: number
    photo: string
}

export interface PrintDoc {
    id: number
    team: number
    content: string
    filepath: string
    send: boolean
    sendat: Date
    acceptat: Date
}

export interface SeatDoc {
    id: number
    name: string
    team: number
    ip: string
    desktop: string
    webcam: string
}

export interface BalloonDoc {
    id: number
    team: number
    problem: string
    send: boolean
    sendat: Date
    acceptat: Date
}

export interface Tables {
    user: Udoc
    team: TeamDoc
    print: PrintDoc
    seat: SeatDoc
    balloon: BalloonDoc
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
        }
    }
}
