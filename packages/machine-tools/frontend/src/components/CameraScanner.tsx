import { Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useEffect, useRef, useState } from 'react';
import { startCameraScan } from '../utils/quickConfigRuntime';

interface CameraScannerProps {
    onResult: (value: string) => boolean;
    onError: (message: string) => void;
}

export function CameraScanner({ onResult, onError }: CameraScannerProps) {
    const callbacks = useRef({ onResult, onError });
    callbacks.current = { onResult, onError };
    const [status, setStatus] = useState('正在使用默认浏览器打开扫码页面…');

    useEffect(() => {
        const controller = new AbortController();
        const fail = (message: string) => {
            if (controller.signal.aborted) return;
            controller.abort();
            callbacks.current.onError(message);
        };
        void startCameraScan(
            controller.signal,
            (value) => !controller.signal.aborted && callbacks.current.onResult(value),
            fail,
            // Restoration finishes after this component may have unmounted.
            (message) => notifications.show({ color: 'red', title: '摄像头清理失败', message, autoClose: false }),
        ).then(() => {
            if (!controller.signal.aborted) setStatus('请在浏览器中允许使用摄像头并扫描标签，识别后确认修改');
        }).catch((reason) => fail(reason instanceof Error ? reason.message : String(reason)));
        return () => controller.abort();
    }, []);

    return <Text size="sm" c="dimmed" ta="center">{status}</Text>;
}
