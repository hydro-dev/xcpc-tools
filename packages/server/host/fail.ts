import type { Context } from 'cordis';

let appCtx: Context | null = null;

export function bindLogger(ctx: Context) {
    appCtx = ctx;
}

export function exitWithError(message: string | string[]): never {
    const lines = Array.isArray(message) ? message : [message];
    for (const line of lines) {
        // eslint-disable-next-line no-console
        console.error(line);
    }
    appCtx?.logger('app').error?.(lines.join('\n'));
    process.exit(1);
}
