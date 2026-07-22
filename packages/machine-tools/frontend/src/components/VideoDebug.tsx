import {
    Badge, Button, Group, Paper, SimpleGrid, Stack, Text, Textarea, Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { filesystem, os } from '@neutralinojs/lib';
import {
    IconAdjustments, IconCamera, IconDeviceDesktop, IconEye, IconPlayerPlay, IconPlayerStop,
    IconPower, IconRefresh, IconScreenShare,
} from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';
import { writePrivilegedFile } from '../utils/privileged';

interface V4l2Device {
    name: string;
    nodes: string[];
}

interface VideoQuickControlsProps {
    cameraForced: boolean;
    onOpenDetails: () => void;
    onOpenMachineInfo: () => void;
    onReviewed: () => void;
}

function runVideoCommand(action: () => Promise<void>, titleText = '视频操作失败') {
    action().catch((error) => notifications.show({
        color: 'red',
        title: titleText,
        message: (error as Error).message,
    }));
}

export function VideoQuickControls({
    cameraForced, onOpenDetails, onOpenMachineInfo, onReviewed,
}: VideoQuickControlsProps) {
    const [loading, setLoading] = useState(false);
    const [cameraRunning, setCameraRunning] = useState(false);
    const [screenRunning, setScreenRunning] = useState(false);
    const [cameraEnabled, setCameraEnabled] = useState(false);
    const [screenEnabled, setScreenEnabled] = useState(false);
    const [cameraPresent, setCameraPresent] = useState(false);

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const [camera, screen, cameraAutostart, screenAutostart, devices] = await Promise.all([
                os.execCommand('systemctl is-active vlc-webcam').catch(() => undefined),
                os.execCommand('systemctl is-active vlc-screen').catch(() => undefined),
                os.execCommand('systemctl is-enabled vlc-webcam').catch(() => undefined),
                os.execCommand('systemctl is-enabled vlc-screen').catch(() => undefined),
                filesystem.readDirectory('/dev').catch(() => []),
            ]);
            setCameraRunning(camera?.stdOut.trim() === 'active');
            setScreenRunning(screen?.stdOut.trim() === 'active');
            setCameraEnabled(cameraAutostart?.stdOut.trim() === 'enabled');
            setScreenEnabled(screenAutostart?.stdOut.trim() === 'enabled');
            setCameraPresent(devices.some((entry) => entry.entry.startsWith('video')));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        runVideoCommand(refresh, '视频状态刷新失败');
    }, [refresh]);

    const control = async (service: 'vlc-webcam' | 'vlc-screen', action: 'restart' | 'stop') => {
        if (service === 'vlc-webcam' && action === 'restart' && !cameraPresent && !cameraForced) {
            throw new Error('摄像头未连接；如设备检测异常，请在“详细调节视频”中强制启用摄像头');
        }
        const result = await os.execCommand(`systemctl ${action} ${service}`);
        if (result.exitCode !== 0) throw new Error(result.stdErr || `${service} ${action} failed`);
        notifications.show({
            color: 'blue',
            title: '视频服务已更新',
            message: `${service}: ${action === 'restart' ? '已启动' : '已停止'}`,
        });
        onReviewed();
        await refresh();
    };

    const preview = async (service: 'vlc-webcam' | 'vlc-screen') => {
        const configPath = service === 'vlc-webcam' ? '/etc/default/vlc-webcam' : '/etc/default/vlc-screen';
        const fallback = service === 'vlc-webcam' ? '8080' : '8090';
        const config = await filesystem.readFile(configPath).catch(() => '');
        const port = config.match(/^VLC_PORT=(\d+)$/m)?.[1] || fallback;
        const result = await os.execCommand(`vlc http://localhost:${port}/ > /dev/null 2>&1 &`);
        if (result.exitCode !== 0) throw new Error(result.stdErr || 'VLC 启动失败');
        onReviewed();
        notifications.show({ color: 'blue', title: 'VLC 预览已启动', message: `http://localhost:${port}/` });
    };

    const toggleAutostart = async (service: 'vlc-webcam' | 'vlc-screen', enabled: boolean) => {
        const action = enabled ? 'disable' : 'enable';
        const result = await os.execCommand(`systemctl ${action} ${service}`);
        if (result.exitCode !== 0) throw new Error(result.stdErr || `${service} ${action} failed`);
        notifications.show({
            color: enabled ? 'blue' : 'red',
            title: enabled ? '已关闭自启' : '已开启自启',
            message: service,
        });
        onReviewed();
        await refresh();
    };

    const services = [
        {
            key: 'vlc-webcam' as const,
            label: '摄像头',
            running: cameraRunning,
            enabled: cameraEnabled,
            icon: IconCamera,
        },
        {
            key: 'vlc-screen' as const,
            label: '桌面',
            running: screenRunning,
            enabled: screenEnabled,
            icon: IconScreenShare,
        },
    ];

    return (
        <Stack gap={0} className="seat-video-tools">
            {services.map((service) => {
                const ServiceIcon = service.icon;
                return (
                    <div className="seat-video-row" key={service.key}>
                        <Group gap="xs" wrap="nowrap" className="seat-video-label">
                            <ServiceIcon size={18} />
                            <Text size="sm" fw={700}>{service.label}</Text>
                            <Badge size="xs" color={service.running ? 'blue' : 'gray'} variant="light">
                                {loading ? '检查中' : service.running ? '运行中' : '已停止'}
                            </Badge>
                        </Group>
                        <Group gap={6} wrap="nowrap">
                            <Button size="compact-xs" onClick={() => runVideoCommand(() => control(service.key, 'restart'))}>启动</Button>
                            <Button
                                size="compact-xs"
                                variant="light"
                                color="red"
                                onClick={() => runVideoCommand(() => control(service.key, 'stop'))}
                            >
                                停止
                            </Button>
                            <Button
                                size="compact-xs"
                                variant="default"
                                onClick={() => runVideoCommand(() => preview(service.key), 'VLC 预览失败')}
                            >
                                预览
                            </Button>
                            <Button
                                size="compact-xs"
                                variant="light"
                                color={service.enabled ? 'red' : 'blue'}
                                aria-pressed={service.enabled}
                                onClick={() => runVideoCommand(() => toggleAutostart(service.key, service.enabled))}
                            >
                                自启
                            </Button>
                        </Group>
                    </div>
                );
            })}
            <SimpleGrid cols={2} spacing="xs" className="seat-video-actions">
                <Button variant="light" leftSection={<IconAdjustments size={17} />} onClick={onOpenDetails}>
                    详细调节视频
                </Button>
                <Button variant="default" leftSection={<IconDeviceDesktop size={17} />} onClick={onOpenMachineInfo}>
                    设备信息
                </Button>
            </SimpleGrid>
        </Stack>
    );
}

interface ServiceCardProps {
    kind: 'camera' | 'screen';
    config: string;
    running: boolean;
    cameraDevices: V4l2Device[];
    cameraForced: boolean;
    onForceCamera: () => void;
    onConfigChange: (value: string) => void;
    onRefresh: () => Promise<void>;
}

function VideoServiceCard({
    kind, config, running, cameraDevices, cameraForced, onForceCamera, onConfigChange, onRefresh,
}: ServiceCardProps) {
    const service = kind === 'camera' ? 'vlc-webcam' : 'vlc-screen';
    const title = kind === 'camera' ? '摄像头' : '屏幕捕获';
    const Icon = kind === 'camera' ? IconCamera : IconScreenShare;

    const controlService = async (action: 'restart' | 'stop' | 'enable' | 'disable') => {
        if (kind === 'camera' && action === 'restart' && !cameraDevices.length && !cameraForced) {
            notifications.show({ color: 'red', title: '摄像头未连接', message: '没有检测到可用的视频设备' });
            return;
        }
        const result = await os.execCommand(`systemctl ${action} ${service}`);
        if (result.exitCode !== 0) throw new Error(result.stdErr || `${service} ${action} failed`);
        notifications.show({ color: 'blue', title: '服务状态已更新', message: `${service}: ${action}` });
        await onRefresh();
    };

    const showStatus = async () => {
        const result = await os.execCommand(`systemctl status ${service} --no-pager`);
        notifications.show({
            color: result.exitCode === 0 ? 'blue' : 'yellow',
            title: `${service} 状态`,
            message: result.stdOut || result.stdErr || 'No output',
            autoClose: 10_000,
        });
    };

    const preview = async () => {
        const fallback = kind === 'camera' ? '8080' : '8090';
        const port = config.match(/^VLC_PORT=(\d+)$/m)?.[1] || fallback;
        const result = await os.execCommand(`vlc http://localhost:${port}/ > /dev/null 2>&1 &`);
        if (result.exitCode !== 0) throw new Error(result.stdErr || 'VLC 启动失败');
        notifications.show({ color: 'blue', title: 'VLC 预览已启动', message: `http://localhost:${port}/` });
    };

    const save = async () => {
        await writePrivilegedFile(kind === 'camera' ? '/etc/default/vlc-webcam' : '/etc/default/vlc-screen', config);
        notifications.show({ color: 'blue', title: '配置已保存', message: '重启对应服务后生效' });
    };

    const run = (action: () => Promise<void>, titleText = '操作失败') => {
        action().catch((error) => notifications.show({ color: 'red', title: titleText, message: error.message }));
    };

    return (
        <Paper withBorder radius="lg" p="lg" className="video-service-card">
            <Group justify="space-between" mb="lg">
                <Group gap="sm">
                    <Icon size={21} />
                    <Text fw={750}>{title}</Text>
                </Group>
                <Tooltip
                    disabled={kind !== 'camera' || !cameraDevices.length}
                    label={cameraDevices.flatMap((device) => [`${device.name}:`, ...device.nodes]).join('\n')}
                    multiline
                >
                    <Badge color={running ? 'blue' : 'gray'} variant="light">
                        {kind === 'camera' && !cameraDevices.length && !cameraForced ? '未检测到设备' : running ? '运行中' : '已停止'}
                    </Badge>
                </Tooltip>
            </Group>
            <Group gap="xs" mb="md">
                <Button size="xs" leftSection={<IconPlayerPlay size={15} />} onClick={() => run(() => controlService('restart'))}>启动</Button>
                <Button
                    size="xs"
                    color="red"
                    variant="light"
                    leftSection={<IconPlayerStop size={15} />}
                    onClick={() => run(() => controlService('stop'))}
                >停止</Button>
                <Button size="xs" variant="light" leftSection={<IconEye size={15} />} onClick={() => run(preview, 'VLC 预览失败')}>预览</Button>
                <Button size="xs" variant="default" onClick={() => run(showStatus, '状态读取失败')}>状态</Button>
                <Button
                    size="xs"
                    variant="subtle"
                    leftSection={<IconPower size={15} />}
                    onClick={() => run(() => controlService('enable'))}
                >开机启用</Button>
                <Button size="xs" variant="subtle" color="gray" onClick={() => run(() => controlService('disable'))}>禁用</Button>
                {kind === 'camera' && !cameraDevices.length && !cameraForced && (
                    <Button size="xs" variant="default" onClick={onForceCamera}>强制摄像头存在</Button>
                )}
            </Group>
            <Textarea
                label={kind === 'camera' ? '/etc/default/vlc-webcam' : '/etc/default/vlc-screen'}
                minRows={8}
                autosize
                maxRows={16}
                value={config}
                onChange={(event) => onConfigChange(event.currentTarget.value)}
            />
            <Button mt="md" variant="light" onClick={() => run(save, '配置保存失败')}>保存{title}配置</Button>
        </Paper>
    );
}

interface VideoDebugProps {
    cameraForced: boolean;
    onForceCamera: () => void;
}

export function VideoDebug({ cameraForced, onForceCamera }: VideoDebugProps) {
    const [loading, setLoading] = useState(false);
    const [cameraConfig, setCameraConfig] = useState('');
    const [screenConfig, setScreenConfig] = useState('');
    const [cameraDevices, setCameraDevices] = useState<V4l2Device[]>([]);
    const [cameraRunning, setCameraRunning] = useState(false);
    const [screenRunning, setScreenRunning] = useState(false);

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const [camera, screen, cameraState, screenState] = await Promise.all([
                filesystem.readFile('/etc/default/vlc-webcam').catch(() => ''),
                filesystem.readFile('/etc/default/vlc-screen').catch(() => ''),
                os.execCommand('systemctl is-active vlc-webcam').catch(() => undefined),
                os.execCommand('systemctl is-active vlc-screen').catch(() => undefined),
            ]);
            setCameraConfig(camera);
            setScreenConfig(screen);
            setCameraRunning(cameraState?.stdOut.trim() === 'active');
            setScreenRunning(screenState?.stdOut.trim() === 'active');
            try {
                const v4l2 = await os.execCommand('v4l2-ctl --list-devices');
                if (v4l2.exitCode !== 0) throw new Error(v4l2.stdErr || 'v4l2-ctl failed');
                const devices: V4l2Device[] = [];
                let current: V4l2Device | undefined;
                for (const line of v4l2.stdOut.split('\n')) {
                    if (!line) continue;
                    if (!line.startsWith('\t')) {
                        current = { name: line.replace(/\s*\(.*\)\s*:?$/, '').trim(), nodes: [] };
                        devices.push(current);
                    } else if (current && line.trim().startsWith('/dev/video')) current.nodes.push(line.trim());
                }
                const videoDevices = devices.filter((device) => device.nodes.length);
                if (!videoDevices.length) throw new Error('v4l2-ctl returned no video devices');
                setCameraDevices(videoDevices);
            } catch {
                const dev = await filesystem.readDirectory('/dev').catch(() => []);
                const nodes = dev.map((entry) => entry.entry)
                    .filter((entry) => entry.startsWith('video'))
                    .map((entry) => `/dev/${entry}`);
                setCameraDevices(nodes.length ? [{ name: 'Video device', nodes }] : []);
            }
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        runVideoCommand(refresh, '视频设备刷新失败');
    }, [refresh]);

    return (
        <Stack gap="lg">
            <Group justify="space-between">
                <Text c="dimmed">摄像头与屏幕捕获并排调试，关闭后返回当前配置页。</Text>
                <Button
                    variant="light"
                    loading={loading}
                    leftSection={<IconRefresh size={17} />}
                    onClick={() => runVideoCommand(refresh, '视频设备刷新失败')}
                >
                    刷新
                </Button>
            </Group>
            <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
                <VideoServiceCard
                    kind="camera"
                    config={cameraConfig}
                    running={cameraRunning}
                    cameraDevices={cameraDevices}
                    cameraForced={cameraForced}
                    onForceCamera={onForceCamera}
                    onConfigChange={setCameraConfig}
                    onRefresh={refresh}
                />
                <VideoServiceCard
                    kind="screen"
                    config={screenConfig}
                    running={screenRunning}
                    cameraDevices={cameraDevices}
                    cameraForced={cameraForced}
                    onForceCamera={onForceCamera}
                    onConfigChange={setScreenConfig}
                    onRefresh={refresh}
                />
            </SimpleGrid>
        </Stack>
    );
}
