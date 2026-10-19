import {
    Button, Container, MantineProvider, Stack, Text, Title,
} from '@mantine/core';
import { app, events } from '@neutralinojs/lib';
import type { IScannerControls } from '@zxing/browser';
import { useEffect, useRef, useState } from 'react';
import type { CameraMessage } from '../utils/cameraSession';
import { CAMERA_EVENT, CAMERA_LEASE_MS } from '../utils/cameraSession';

export default function ScannerPage({ session }: { session: string }) {
    const video = useRef<HTMLVideoElement>(null);
    const cancel = useRef<() => void>(() => {});
    const [status, setStatus] = useState('正在连接配置工具…');
    const [finished, setFinished] = useState(false);

    useEffect(() => {
        let ended = false;
        let started = false;
        let pending = false;
        let lastText = '';
        let stream: MediaStream | undefined;
        let controls: IScannerControls | undefined;
        let heartbeat: number | undefined;
        let deadline: number | undefined;
        const send = (type: CameraMessage['type'], data = {}) => app.broadcast(CAMERA_EVENT, { session, type, ...data });
        const release = () => {
            ended = true;
            window.clearInterval(heartbeat);
            window.clearTimeout(deadline);
            controls?.stop();
            stream?.getTracks().forEach((track) => track.stop());
        };
        const finish = (message: string, close = false, error = false) => {
            if (ended) return;
            release();
            setStatus(message);
            setFinished(true);
            void (async () => {
                try {
                    if (error) await send('error', { message });
                    await send('stopped');
                    if (close) window.close();
                } catch { /* The camera is already released if OOBE has exited. */ }
            })();
        };
        const renew = () => {
            window.clearTimeout(deadline);
            deadline = window.setTimeout(() => finish('配置工具连接已断开，请返回后重新扫码。'), CAMERA_LEASE_MS);
        };
        const start = async () => {
            started = true;
            setStatus('请允许浏览器使用摄像头，然后将标签二维码对准镜头。');
            try {
                const { BrowserQRCodeReader } = await import('@zxing/browser');
                if (ended) return;
                // Own the stream so cancellation can release it even while ZXing starts.
                stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
                if (ended) {
                    stream.getTracks().forEach((track) => track.stop());
                    return;
                }
                stream.getVideoTracks().forEach((track) => {
                    track.addEventListener('ended', () => finish('摄像头已断开，请重新扫码。', false, true), { once: true });
                });
                controls = await new BrowserQRCodeReader().decodeFromStream(stream, video.current!, (result) => {
                    if (ended || pending || !result || result.getText() === lastText) return;
                    lastText = result.getText();
                    pending = true;
                    setStatus('正在读取配置…');
                    void send('result', { text: lastText }).catch(() => finish('无法发送扫码结果，请重新扫码。', false, true));
                });
                if (ended) controls.stop();
            } catch (error) {
                const name = error instanceof Error ? error.name : '';
                const message = name === 'NotAllowedError' ? '摄像头权限被拒绝，请允许访问后重新扫码。'
                    : name === 'NotFoundError' ? '没有找到摄像头，请连接后重新扫码。'
                        : '无法打开摄像头，请检查设备是否被其他程序占用。';
                finish(message, false, true);
            }
        };
        const handleEvent = ({ detail }: CustomEvent<CameraMessage>) => {
            if (!detail || detail.session !== session) return;
            if (detail.type === 'stop' || detail.type === 'accepted') {
                if (ended) {
                    void send('stopped').catch(() => undefined);
                    return;
                }
                finish(detail.type === 'accepted' ? '配置已送回，请返回配置工具确认修改。' : '扫码已停止。', true);
            } else if (!ended && detail.type === 'active') {
                renew();
                if (!started) void start();
            } else if (!ended && detail.type === 'rejected') {
                pending = false;
                setStatus('二维码配置无效，请更换标签；配置工具中可查看具体原因。');
            }
        };
        const pageHide = () => {
            release();
            void send('stopped').catch(() => undefined);
        };
        const disconnected = () => finish('配置工具已退出，请关闭此窗口。');
        cancel.current = () => finish('扫码已停止。', true);
        renew();
        window.addEventListener('pagehide', pageHide);
        void (async () => {
            await events.on(CAMERA_EVENT, handleEvent);
            await events.on('serverOffline', disconnected);
            if (ended) return;
            const ready = () => { void send('ready').catch(disconnected); };
            heartbeat = window.setInterval(ready, 1000);
            ready();
        })().catch(() => finish('无法连接配置工具，请重新扫码。'));
        return () => {
            release();
            window.removeEventListener('pagehide', pageHide);
            void events.off(CAMERA_EVENT, handleEvent);
            void events.off('serverOffline', disconnected);
        };
    }, [session]);

    return (
        <MantineProvider defaultColorScheme="auto">
            <Container size="sm" py="xl">
                <Stack>
                    <Title order={1}>扫描配置标签</Title>
                    <Text role="status">{status}</Text>
                    <video ref={video} autoPlay muted playsInline hidden={finished} style={{ width: '100%', maxHeight: '65vh' }} />
                    {finished ? <Text size="sm" c="dimmed">摄像头已停止，可以关闭此窗口。</Text>
                        : <Button variant="default" onClick={() => cancel.current()}>取消扫码</Button>}
                </Stack>
            </Container>
        </MantineProvider>
    );
}
