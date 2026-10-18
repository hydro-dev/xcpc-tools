import type { Context } from 'cordis';

// ---------------------------------------------------------------------------
// Single fatal-exit helper for the whole host layer (review §3.5): every
// boot-time failure path goes through here so the output shape stays
// consistent. Before the logger service is up we print to stderr; once a ctx
// with a working logger is available, pass it and the message is also logged
// through the normal channels (timestamps, levels).
// ---------------------------------------------------------------------------

let appCtx: Context | null = null;

/** Remember the app context so later fail() calls can use the real logger. */
export function bindLogger(ctx: Context) {
    appCtx = ctx;
}

export function exitWithError(message: string | string[]): never {
    const lines = Array.isArray(message) ? message : [message];
    // console is the only channel guaranteed to exist pre-logger; keep it in
    // addition to the logger so supervisors capture the reason either way.
    for (const line of lines) {
        // eslint-disable-next-line no-console
        console.error(line);
    }
    appCtx?.logger('app').error?.(lines.join('\n'));
    // Note: no process.send signal before exit — pm2 infers failure from the
    // exit code alone, which is enough for the ready-timeout path.
    process.exit(1);
}
