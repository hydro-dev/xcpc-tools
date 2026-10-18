import 'cordis';

declare module 'cordis' {
    interface Events {
        'print/newTask': (count: number) => void;
        'print/sendTask': (client: string) => void;
        'print/doneTask': (client: string, printer: string) => void;
        'balloon/newTask': (count: number) => void;
        'balloon/sendTask': (client: string, count: number) => void;
        'balloon/doneTask': (client: string, count: number) => void;
    }
}
