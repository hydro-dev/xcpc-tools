import path from 'node:path';
import { Context } from 'cordis';
import type { ClientChannel } from 'ssh2';
import { Client } from 'ssh2';
import { config } from '../config';
import { fs } from '../utils';

export interface InteractiveShell {
    write(data: Buffer | string): void;
    resize(cols: number, rows: number): void;
    close(): void;
}

interface OpenShellOptions {
    host: string;
    fingerprint?: string;
    cols?: number;
    rows?: number;
    signal?: AbortSignal;
    onFingerprint?(fingerprint: string): Promise<void>;
    onData(data: Buffer): void;
    onClose(code?: number | null, signal?: string | null): void;
}

const clients = new Set<Client>();

export async function openSshShell(options: OpenShellOptions): Promise<InteractiveShell> {
    if (!config.customKeyfile) throw new Error('customKeyfile is required for WebSSH');
    const client = new Client();
    clients.add(client);
    let channel: ClientChannel | null = null;
    let opened = false;
    let closed = false;
    let exitCode: number | null | undefined;
    let exitSignal: string | null | undefined;
    let fingerprint = '';
    let fingerprintError: Error | null = null;
    const finish = () => {
        if (closed) return;
        closed = true;
        clients.delete(client);
        options.signal?.removeEventListener('abort', abort);
        if (opened) options.onClose(exitCode, exitSignal);
    };
    const abort = () => client.destroy();
    options.signal?.addEventListener('abort', abort, { once: true });

    try {
        await new Promise<void>((resolve, reject) => {
            client.once('ready', async () => {
                try {
                    if (!options.fingerprint && fingerprint) await options.onFingerprint?.(fingerprint);
                } catch (error) {
                    reject(error);
                    return;
                }
                client.shell({
                    term: 'xterm-256color',
                    cols: Math.max(2, Math.min(500, options.cols || 120)),
                    rows: Math.max(2, Math.min(300, options.rows || 32)),
                }, (error, stream) => {
                    if (error) {
                        reject(error);
                        return;
                    }
                    channel = stream;
                    opened = true;
                    stream.on('data', options.onData);
                    stream.stderr.on('data', options.onData);
                    stream.on('exit', (code, signal) => {
                        exitCode = code;
                        exitSignal = signal;
                    });
                    stream.once('close', finish);
                    resolve();
                });
            });
            client.once('error', (error) => reject(fingerprintError || error));
            client.once('close', () => {
                finish();
                if (!opened) reject(fingerprintError || new Error('SSH connection closed before the shell was ready'));
            });
            client.connect({
                host: options.host,
                port: 22,
                username: config.ssh.username,
                privateKey: fs.readFileSync(path.resolve(process.cwd(), config.customKeyfile)),
                readyTimeout: 10_000,
                hostHash: 'sha256',
                hostVerifier: (value) => {
                    fingerprint = value;
                    if (!options.fingerprint || options.fingerprint === value) return true;
                    fingerprintError = new Error(`SSH host fingerprint changed for ${options.host}`);
                    return false;
                },
            });
        });
    } catch (error) {
        client.destroy();
        finish();
        throw error;
    }

    return {
        write: (data) => { channel?.write(data); },
        resize: (cols, rows) => channel?.setWindow(
            Math.max(2, Math.min(300, rows)),
            Math.max(2, Math.min(500, cols)),
            0,
            0,
        ),
        close: () => {
            channel?.end();
            client.end();
        },
    };
}

export async function apply(ctx: Context) {
    if (!config.ssh.enabled) return;
    ctx.effect(() => () => {
        for (const client of clients) client.destroy();
        clients.clear();
    });
}
