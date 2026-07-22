import type { MachineSnapshot } from '../types';

interface ProbeServerMessage {
    type?: string;
}

export interface ProbeTestResult {
    reportedAt: number;
}

type SocketFactory = (url: string) => WebSocket;

export function testProbeReport(
    probeUrl: string,
    token: string,
    snapshot: MachineSnapshot,
    createSocket: SocketFactory = (url) => new WebSocket(url),
): Promise<ProbeTestResult> {
    return new Promise((resolve, reject) => {
        const endpoint = new URL(probeUrl);
        if (token.trim()) endpoint.searchParams.set('token', token.trim());
        else endpoint.searchParams.delete('token');
        const socket = createSocket(endpoint.toString());
        let settled = false;
        let timer: ReturnType<typeof globalThis.setTimeout>;

        const finish = (error?: Error) => {
            if (settled) return;
            settled = true;
            globalThis.clearTimeout(timer);
            try {
                socket.close(1000, 'Probe test complete');
            } catch {
                // The socket may already be closed.
            }
            if (error) reject(error);
            else resolve({ reportedAt: Date.now() });
        };
        timer = globalThis.setTimeout(() => finish(new Error('WebSocket 测试上报超时')), 10_000);

        socket.addEventListener('open', () => {
            socket.send(JSON.stringify({ type: 'hello', probe: snapshot }));
        });
        socket.addEventListener('message', (event) => {
            let message: ProbeServerMessage;
            try {
                message = JSON.parse(String(event.data));
            } catch {
                finish(new Error('服务器返回了非 JSON WebSocket 消息'));
                return;
            }
            if (message.type === 'welcome') {
                finish();
            }
        });
        socket.addEventListener('error', () => finish(new Error('WebSocket 连接失败')));
        socket.addEventListener('close', () => {
            if (!settled) finish(new Error('WebSocket 在测试上报完成前关闭'));
        });
    });
}
