import { randomBytes } from 'node:crypto';
import { Context } from 'cordis';
import {
    BadRequestError, ConnectionHandler, ForbiddenError,
} from '@hydrooj/framework';
import { config } from '../config';
import { InteractiveShell, openSshShell } from '../service/ssh';
import { AuthHandler } from './misc';

interface Ticket {
    monitorId: string;
    host: string;
    seat: string;
    fingerprint?: string;
    expiresAt: number;
}

const tickets = new Map<string, Ticket>();

const issueTicket = (ticket: Omit<Ticket, 'expiresAt'>) => {
    const now = Date.now();
    for (const [token, value] of tickets) {
        if (value.expiresAt <= now) tickets.delete(token);
    }
    const token = randomBytes(24).toString('base64url');
    const expiresAt = now + 30_000;
    tickets.set(token, { ...ticket, expiresAt });
    return { token, expiresAt };
};

const consumeTicket = (token: unknown) => {
    if (typeof token !== 'string') return null;
    const ticket = tickets.get(token);
    tickets.delete(token);
    if (!ticket || ticket.expiresAt <= Date.now()) return null;
    return ticket;
};

class WebSshTicketHandler extends AuthHandler {
    async post({ monitorId }) {
        if (!config.ssh.enabled) throw new ForbiddenError('WebSSH is disabled');
        if (!monitorId || typeof monitorId !== 'string') throw new BadRequestError('Machine is required');
        const monitor = await this.ctx.db.monitor.findOne({ _id: monitorId });
        if (!monitor?.ip) throw new BadRequestError('Machine has not reported an IP address');
        this.response.body = issueTicket({
            monitorId: monitor._id,
            host: monitor.ip,
            seat: String(monitor.name || monitor.hostname || monitor.ip),
            fingerprint: monitor.sshFingerprint,
        });
    }
}

const dimension = (value: unknown, fallback: number, maximum: number) => {
    const result = Number(value || fallback);
    return Number.isInteger(result) && result >= 2 && result <= maximum ? result : fallback;
};

export class WebSshConnectionHandler extends ConnectionHandler<Context> {
    shell: InteractiveShell | null = null;
    opening = false;
    controller: AbortController | null = null;

    safeSend(payload: Record<string, unknown>) {
        if (this.conn.readyState === 1) this.send(payload);
    }

    async message(payload) {
        if (!this.shell) {
            if (this.opening || payload?.type !== 'auth') {
                this.close(4003, 'WebSSH ticket required');
                return;
            }
            const ticket = consumeTicket(payload.ticket);
            if (!ticket) {
                this.close(4003, 'Invalid or expired WebSSH ticket');
                return;
            }
            this.opening = true;
            this.controller = new AbortController();
            try {
                this.shell = await openSshShell({
                    host: ticket.host,
                    fingerprint: ticket.fingerprint,
                    cols: dimension(payload.cols, 120, 500),
                    rows: dimension(payload.rows, 32, 300),
                    signal: this.controller.signal,
                    onFingerprint: async (fingerprint) => {
                        const stored = await this.ctx.db.monitor.updateOne(
                            {
                                _id: ticket.monitorId,
                                $or: [
                                    { sshFingerprint: { $exists: false } },
                                    { sshFingerprint: '' },
                                    { sshFingerprint: null },
                                ],
                            },
                            { $set: { sshFingerprint: fingerprint } },
                        );
                        if (stored) return;
                        const monitor = await this.ctx.db.monitor.findOne({ _id: ticket.monitorId });
                        if (monitor?.sshFingerprint !== fingerprint) {
                            throw new Error(`SSH host fingerprint changed for ${ticket.host}`);
                        }
                    },
                    onData: (data) => {
                        this.safeSend({ type: 'data', data: data.toString('base64') });
                    },
                    onClose: (code, signal) => {
                        this.safeSend({ type: 'exit', code: code ?? null, signal: signal ?? null });
                        this.close(1000, 'SSH session closed');
                    },
                });
                this.safeSend({ type: 'ready', seat: ticket.seat });
            } catch (error) {
                this.safeSend({
                    type: 'error',
                    message: error instanceof Error ? error.message : 'Unable to open SSH session',
                });
                this.close(4004, 'SSH session open failed');
            } finally {
                this.opening = false;
                this.controller = null;
            }
            return;
        }
        if (payload?.type === 'input' && typeof payload.data === 'string') {
            this.shell.write(payload.data);
        } else if (payload?.type === 'resize') {
            this.shell.resize(
                dimension(payload.cols, 120, 500),
                dimension(payload.rows, 32, 300),
            );
        } else if (payload?.type === 'close') {
            this.shell.close();
        }
    }

    async cleanup() {
        this.controller?.abort();
        this.shell?.close();
        this.shell = null;
    }
}

export async function apply(ctx: Context) {
    if (!config.ssh.enabled) return;
    ctx.Route('webssh_ticket', '/ssh/ticket', WebSshTicketHandler);
    ctx.Connection('webssh', '/ssh/ws', WebSshConnectionHandler);
}
