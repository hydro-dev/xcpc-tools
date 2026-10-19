import { app, events, os } from '@neutralinojs/lib';
import type { CameraMessage } from './cameraSession';
import { CAMERA_EVENT, CAMERA_LEASE_MS } from './cameraSession';

// Reopening waits for the previous page to release the camera and restore VLC.
let previousScan = Promise.resolve();
const scans = new Set<() => Promise<void>>();

export async function stopCameraScan() {
    while (scans.size) await Promise.all([...scans].map((stop) => stop()));
}

async function cameraCommand(command: string) {
    const result = await os.execCommand(command);
    if (result.exitCode !== 0) throw new Error(result.stdErr.trim() || '摄像头服务操作失败');
    return result.stdOut.trim();
}

export async function startCameraScan(
    signal: AbortSignal,
    onResult: (value: string) => boolean,
    onError: (message: string) => void,
    onCleanupError: (message: string) => void,
) {
    const previous = previousScan;
    let releaseSession!: () => void;
    const finished = new Promise<void>((resolve) => { releaseSession = resolve; });
    previousScan = previous.then(() => finished);
    const session = crypto.randomUUID();
    let stopped = false;
    let launched = false;
    let connected = false;
    let restoreVlc = false;
    let accepted = false;
    let timeout: number | undefined;
    let heartbeat: number | undefined;
    let resolveReady!: () => void;
    let rejectReady!: (error: Error) => void;
    let resolveLaunched!: () => void;
    let resolveReleased!: () => void;
    let handleEvent: (event: CustomEvent<CameraMessage>) => void;
    let abort: () => void;
    let stopPromise: Promise<void> | undefined;
    const launchDone = new Promise<void>((resolve) => { resolveLaunched = resolve; });
    const released = new Promise<void>((resolve) => { resolveReleased = resolve; });
    const readiness = new Promise<void>((resolve, reject) => {
        resolveReady = resolve;
        rejectReady = reject;
    });
    const send = (type: CameraMessage['type']) => app.broadcast(CAMERA_EVENT, { session, type });
    const stop = (reason = new Error('扫码已停止')) => {
        if (stopPromise) return stopPromise;
        stopped = true;
        window.clearTimeout(timeout);
        window.clearTimeout(heartbeat);
        signal.removeEventListener('abort', abort);
        rejectReady(reason);
        stopPromise = (async () => {
            try {
                await launchDone;
                if (connected) {
                    // Never kill the browser: the launch may have reused an existing process.
                    let releaseTimeout: number | undefined;
                    const expired = new Promise<void>((resolve) => {
                        releaseTimeout = window.setTimeout(() => {
                            onCleanupError('扫码页面未确认释放摄像头，请关闭扫码窗口');
                            resolve();
                        }, CAMERA_LEASE_MS + 1000);
                    });
                    try {
                        await Promise.race([send(accepted ? 'accepted' : 'stop').then(() => released), expired]);
                    } finally {
                        window.clearTimeout(releaseTimeout);
                    }
                }
            } catch (error) {
                onCleanupError(error instanceof Error ? error.message : String(error));
            } finally {
                try {
                    if (restoreVlc) await cameraCommand('systemctl start vlc-webcam.service');
                } catch (error) {
                    onCleanupError(error instanceof Error ? error.message : String(error));
                }
                await events.off(CAMERA_EVENT, handleEvent).catch(() => undefined);
                scans.delete(stop);
                releaseSession();
            }
        })();
        return stopPromise;
    };
    const fail = (message: string) => {
        if (stopped) return;
        void stop(new Error(message));
        if (launched) onError(message);
    };
    handleEvent = ({ detail }: CustomEvent<CameraMessage>) => {
        if (!detail || detail.session !== session) return;
        if (detail.type === 'stopped') {
            resolveReleased();
            fail('扫码窗口已关闭，请重新打开扫码');
        }
        if (stopped) return;
        if (detail.type === 'ready') {
            connected = true;
            window.clearTimeout(heartbeat);
            heartbeat = window.setTimeout(() => fail('扫码窗口连接已断开，请重新打开扫码'), CAMERA_LEASE_MS);
            void send('active').catch(() => fail('无法连接扫码窗口'));
        } else if (detail.type === 'error') {
            fail(typeof detail.message === 'string' ? detail.message.slice(0, 500) : '摄像头扫码失败');
        } else if (detail.type === 'result') {
            if (typeof detail.text !== 'string' || new TextEncoder().encode(detail.text).length > 4096) {
                void send('rejected').catch(() => fail('无法连接扫码窗口'));
            } else if (onResult(detail.text)) {
                accepted = true;
                void stop();
            } else {
                void send('rejected').catch(() => fail('无法连接扫码窗口'));
            }
        }
    };
    abort = () => { void stop(); };
    scans.add(stop);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    void (async () => {
        try {
            await previous;
            if (stopped) return;
            timeout = window.setTimeout(() => fail('扫码超时，请重新打开扫码'), 90_000);
            const token = window.NL_TOKEN || sessionStorage.getItem('NL_TOKEN');
            if (!token || !window.NL_PORT) throw new Error('无法获取扫码连接凭据，请重新打开配置工具');
            const url = new URL(`http://127.0.0.1:${window.NL_PORT}/`);
            url.search = new URLSearchParams({ mode: 'scan', session }).toString();
            url.hash = new URLSearchParams({ token }).toString();
            const state = await cameraCommand('systemctl show vlc-webcam.service --property=LoadState --property=ActiveState');
            if (stopped) return;
            const properties = Object.fromEntries(state.split('\n').map((line) => line.split('=')));
            if (properties.LoadState !== 'not-found') {
                if (properties.ActiveState === 'active') {
                    restoreVlc = true;
                    await cameraCommand('systemctl stop vlc-webcam.service');
                } else if (!['inactive', 'failed'].includes(properties.ActiveState)) {
                    throw new Error('摄像头服务正在切换状态，请稍后重试');
                }
            }
            if (stopped) return;
            await events.on(CAMERA_EVENT, handleEvent);
            if (stopped) return;
            await os.open(url.href);
            launched = true;
            resolveReady();
        } catch (error) {
            fail(error instanceof Error ? error.message : String(error));
        } finally {
            resolveLaunched();
        }
    })();
    await readiness;
    return { stop };
}
