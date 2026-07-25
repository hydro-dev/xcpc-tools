import {
    Badge, Button, Divider, Drawer, Group, Modal, Paper, PasswordInput, SimpleGrid,
    Stack, Text, TextInput,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { app, filesystem, os } from '@neutralinojs/lib';
import {
    IconActivityHeartbeat, IconDeviceDesktop, IconNetwork, IconServer, IconWifi,
} from '@tabler/icons-react';
import {
    useCallback, useEffect, useMemo, useState,
} from 'react';
import type {
    MachineSnapshot, MachineToolsConfig, ProbeServiceState,
} from '../types';
import { runPrivileged, writePrivilegedFile } from '../utils/privileged';
import { testProbeReport } from '../utils/probe';
import {
    collectMachineSnapshot, deriveServerEndpoints, HEARTBEAT_CONFIG_PATH, heartbeatVersionUrl,
    MACHINE_TOOLS_ENV_PATH, SEAT_CONFIG_PATH, shellQuote,
} from '../utils/system';
import { MachineInfo } from './MachineInfo';
import { VideoDebug, VideoQuickControls } from './VideoDebug';

interface SetupPanelProps {
    config: MachineToolsConfig;
    snapshot?: MachineSnapshot;
    probeServiceState: ProbeServiceState;
    onConfigChange: (config: MachineToolsConfig) => void;
    onSnapshot: (snapshot: MachineSnapshot) => void;
    onProbeServiceState: (state: ProbeServiceState) => void;
}

interface ProbeTestState {
    reportedAt: number;
}

interface StatusTileProps {
    icon: typeof IconNetwork;
    label: string;
    value: string;
    detail: string;
}

const HEARTBEAT_SEARCH_PATHS = [
    '/usr/local/sbin/heartbeat',
    '/usr/local/bin/heartbeat',
    '/usr/sbin/heartbeat',
    '/usr/bin/heartbeat',
];

let cachedHeartbeatPath = '';

const serverAddressForInput = (value: string) => value.trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/report\/?$/i, '')
    .replace(/\/$/, '');

async function getHeartbeatPath() {
    if (cachedHeartbeatPath) return cachedHeartbeatPath;
    const candidates = await Promise.all(HEARTBEAT_SEARCH_PATHS.map(async (path) => ({
        path,
        stats: await filesystem.getStats(path).catch(() => null),
    })));
    const candidate = candidates.find((item) => item.stats?.isFile);
    if (candidate) {
        cachedHeartbeatPath = candidate.path;
        return cachedHeartbeatPath;
    }
    const result = await os.execCommand('command -v heartbeat');
    if (result.exitCode === 0 && result.stdOut.trim().startsWith('/')) {
        cachedHeartbeatPath = result.stdOut.trim();
        return cachedHeartbeatPath;
    }
    throw new Error(`未找到 heartbeat（已检查 ${HEARTBEAT_SEARCH_PATHS.join('、')}）`);
}

function StatusTile({
    icon: Icon, label, value, detail,
}: StatusTileProps) {
    return (
        <div className="setup-status-tile">
            <Group justify="space-between" wrap="nowrap" gap="xs">
                <Text size="xs" fw={700} c="dimmed">{label}</Text>
                <Icon size={17} aria-hidden="true" />
            </Group>
            <Text fw={750} mt={8} lineClamp={1}>{value}</Text>
            <Text size="xs" c="dimmed" mt={4} lineClamp={2}>{detail}</Text>
        </div>
    );
}

const probeServiceLabels: Record<ProbeServiceState, string> = {
    active: 'systemd 已启动',
    activating: 'systemd 启动中',
    inactive: 'systemd 未启动',
    failed: 'systemd 启动失败',
    'not-found': '镜像缺少 systemd 服务',
    unknown: 'systemd 状态未知',
};

export function SetupPanel({
    config, snapshot, probeServiceState, onConfigChange, onSnapshot, onProbeServiceState,
}: SetupPanelProps) {
    const [seat, setSeat] = useState(config.seat || '');
    const [serverInput, setServerInput] = useState(serverAddressForInput(
        config.heartbeatUrl || config.serverUrl || '',
    ));
    const [reportToken, setReportToken] = useState(config.reportToken || '');
    const [saving, setSaving] = useState(false);
    const [testingHeartbeat, setTestingHeartbeat] = useState(false);
    const [testingProbe, setTestingProbe] = useState(false);
    const [heartbeatTimerActive, setHeartbeatTimerActive] = useState(false);
    const [heartbeatServiceResult, setHeartbeatServiceResult] = useState('');
    const [probeTest, setProbeTest] = useState<ProbeTestState>();
    const [operationError, setOperationError] = useState('');
    const [cameraForced, setCameraForced] = useState(false);
    const [finishMode, setFinishMode] = useState<'normal' | 'force' | null>(null);
    const [machineOpened, machineControls] = useDisclosure(false);
    const [videoOpened, videoControls] = useDisclosure(false);

    const cleanSeat = seat.trim();
    const useProbe = probeServiceState !== 'not-found' && probeServiceState !== 'unknown';
    const primaryNetwork = snapshot?.networks.find((network) => network.isDefault) || snapshot?.networks[0];
    const ip = snapshot?.ip || primaryNetwork?.ipv4[0] || '';
    const endpoints = useMemo(() => {
        try {
            return deriveServerEndpoints(serverInput);
        } catch {
            return undefined;
        }
    }, [serverInput]);
    const probeDetail = probeTest
        ? `最近测试：${new Date(probeTest.reportedAt).toLocaleTimeString()}`
        : '尚未测试';

    const validateSeat = useCallback(() => {
        if (!cleanSeat || !/^[A-Za-z0-9][A-Za-z0-9-]{0,62}$/.test(cleanSeat)) {
            throw new Error('座位号只能包含字母、数字和连字符，最长 63 个字符');
        }
        return cleanSeat;
    }, [cleanSeat]);

    const currentReportToken = useCallback(() => reportToken.trim(), [reportToken]);

    const refreshHeartbeatState = useCallback(async () => {
        const [timer, service] = await Promise.all([
            os.execCommand('systemctl is-active heartbeat.timer').catch(() => undefined),
            os.execCommand('systemctl show heartbeat.service --property=Result').catch(() => undefined),
        ]);
        setHeartbeatTimerActive(timer?.stdOut.trim() === 'active');
        setHeartbeatServiceResult(service?.stdOut.trim().split('=')[1] || '');
    }, []);

    useEffect(() => {
        refreshHeartbeatState();
        const interval = window.setInterval(() => {
            refreshHeartbeatState();
        }, 30_000);
        return () => window.clearInterval(interval);
    }, [refreshHeartbeatState]);

    const configForEndpoints = useCallback(() => {
        if (!endpoints) throw new Error('请输入有效的服务器或 HEARTBEATURL');
        return {
            ...config,
            seat: config.seat || '',
            ...endpoints,
            reportToken: currentReportToken(),
        } satisfies MachineToolsConfig;
    }, [config, currentReportToken, endpoints]);

    const saveIdentity = async () => {
        setSaving(true);
        try {
            const next = { ...config, seat: validateSeat() };
            await writePrivilegedFile(SEAT_CONFIG_PATH, `${JSON.stringify({ seat: next.seat })}\n`);
            await runPrivileged('/usr/bin/hostnamectl', ['set-hostname', next.seat || '']);
            onConfigChange(next);
            const nextSnapshot = await collectMachineSnapshot().catch(() => undefined);
            if (nextSnapshot) onSnapshot(nextSnapshot);
            notifications.show({ color: 'blue', title: '座位号已保存', message: '本地配置和系统主机名已经同步' });
        } catch (error) {
            notifications.show({ color: 'red', title: '保存座位号失败', message: (error as Error).message });
        } finally {
            setSaving(false);
        }
    };

    const showSeat = async () => {
        const text = validateSeat();
        const markup = `<span font='${text.length > 4 ? 128 : 256}'>${text}</span>`;
        const result = await os.execCommand(`zenity --info --text ${shellQuote(markup)} > /dev/null 2>&1 &`);
        if (result.exitCode !== 0) throw new Error(result.stdErr || 'zenity 启动失败');
    };

    const checkHeartbeatVersion = async (heartbeatUrl: string) => {
        const response = await fetch(heartbeatVersionUrl(heartbeatUrl), { cache: 'no-store' });
        if (!response.ok) throw new Error(`上报中心版本检查失败 (${response.status})`);
        const version = await response.json();
        if (!version) throw new Error('无法获取上报中心版本');
        return String(version.version || 'unknown');
    };

    const runHeartbeat = async (heartbeatUrl: string) => {
        const heartbeatPath = await getHeartbeatPath();
        const command = `HEARTBEATURL=${shellQuote(heartbeatUrl)} REPORTTOKEN=${shellQuote(currentReportToken())} ${shellQuote(heartbeatPath)}`;
        const result = await os.execCommand(command);
        if (result.exitCode !== 0 || result.stdErr) throw new Error(result.stdErr || 'heartbeat 测试上报失败');
    };

    const testHeartbeat = async (notify = true) => {
        setTestingHeartbeat(true);
        setOperationError('');
        try {
            if (!endpoints) throw new Error('请输入有效的服务器或 HEARTBEATURL');
            const version = await checkHeartbeatVersion(endpoints.heartbeatUrl);
            await runHeartbeat(endpoints.heartbeatUrl);
            if (notify) {
                notifications.show({
                    color: 'blue',
                    title: 'HTTP heartbeat 测试成功',
                    message: `上报中心版本：${version}`,
                });
            }
            return endpoints;
        } catch (error) {
            setOperationError((error as Error).message);
            if (notify) notifications.show({ color: 'red', title: 'HTTP heartbeat 测试失败', message: (error as Error).message });
            throw error;
        } finally {
            setTestingHeartbeat(false);
        }
    };

    const showHeartbeatService = async () => {
        const result = await os.execCommand('systemctl status heartbeat.service --no-pager');
        await refreshHeartbeatState();
        notifications.show({
            color: result.exitCode === 0 ? 'blue' : 'yellow',
            title: 'heartbeat.service 状态',
            message: result.stdOut || result.stdErr || 'No output',
            autoClose: 10_000,
        });
    };

    const testProbe = async (notify = true) => {
        setTestingProbe(true);
        setOperationError('');
        try {
            if (!endpoints) throw new Error('请输入有效的服务器或 HEARTBEATURL');
            const machine = snapshot || await collectMachineSnapshot();
            const result = await testProbeReport(endpoints.probeUrl, currentReportToken(), machine);
            setProbeTest(result);
            if (notify) {
                notifications.show({
                    color: 'blue',
                    title: 'WebSocket 测试上报成功',
                    message: '上报已被服务器接受',
                });
            }
            return result;
        } catch (error) {
            setProbeTest(undefined);
            setOperationError((error as Error).message);
            if (notify) notifications.show({ color: 'red', title: 'WebSocket 测试上报失败', message: (error as Error).message });
            throw error;
        } finally {
            setTestingProbe(false);
        }
    };

    const restartProbe = async () => {
        await runPrivileged('/usr/bin/systemctl', ['enable', 'hydro-machine-tools.service', '--now']);
        await runPrivileged('/usr/bin/systemctl', ['restart', 'hydro-machine-tools.service']);
        const state = await os.execCommand('systemctl is-active hydro-machine-tools.service');
        if (state.stdOut.trim() !== 'active') {
            throw new Error(state.stdErr || '镜像内置的 hydro-machine-tools.service 未启动');
        }
        onProbeServiceState('active');
    };

    const startReporter = async () => {
        if (useProbe) {
            await restartProbe();
            await runPrivileged('/usr/bin/systemctl', ['disable', 'heartbeat.timer', '--now']);
        } else {
            await runPrivileged('/usr/bin/systemctl', ['enable', 'heartbeat.timer', '--now']);
        }
        await refreshHeartbeatState();
    };

    const saveReporting = async (force: boolean) => {
        setSaving(true);
        setOperationError('');
        try {
            const resolved = endpoints;
            if (!resolved) throw new Error('请输入有效的服务器或 HEARTBEATURL');
            if (!force) {
                if (useProbe) await testProbe(false);
                else await testHeartbeat(false);
            }
            if (useProbe) {
                await writePrivilegedFile(
                    MACHINE_TOOLS_ENV_PATH,
                    `PROBEURL=${shellQuote(resolved.probeUrl)}\nREPORTTOKEN=${shellQuote(currentReportToken())}\n`,
                );
            } else {
                await writePrivilegedFile(
                    HEARTBEAT_CONFIG_PATH,
                    `HEARTBEATURL=${resolved.heartbeatUrl}\nREPORTTOKEN=${shellQuote(currentReportToken())}\n`,
                );
            }
            onConfigChange({
                ...configForEndpoints(),
                probeEnabled: useProbe,
            });
            await startReporter();
            notifications.show({
                color: 'blue',
                title: force ? '已强制保存上报配置' : '上报配置已测试并保存',
                message: useProbe ? '已启用 WebSocket Probe' : '已启用 HTTP heartbeat',
            });
        } catch (error) {
            setOperationError((error as Error).message);
            notifications.show({ color: 'red', title: '保存上报配置失败', message: (error as Error).message });
        } finally {
            setSaving(false);
        }
    };

    const finish = async (force: boolean) => {
        setSaving(true);
        setOperationError('');
        try {
            const nextSeat = validateSeat();
            if (!force && (!config.seat || config.seat !== nextSeat)) throw new Error('座位号尚未保存，请先保存座位号');
            const hostname = await os.execCommand('hostname').then((result) => result.stdOut.trim()).catch(() => '');
            if (!force && hostname !== nextSeat) throw new Error('主机名与座位号不匹配，请先保存座位号');
            if (!force && !ip) throw new Error('未获取到内网 IP，请检查网络连接');
            if (!force && (!config.heartbeatUrl || (useProbe && !config.probeEnabled))) {
                throw new Error('上报配置尚未保存，请先保存上报配置');
            }
            await startReporter();
            const markup = `<span font='${nextSeat.length > 4 ? 128 : 256}'>${nextSeat}\n</span><span font='128'>${ip}</span>`;
            os.execCommand(`zenity --info --text ${shellQuote(markup)} > /dev/null 2>&1 &`).catch(() => undefined);
            notifications.show({
                color: 'blue', title: '设备配置完成', message: '程序将在 5 秒后关闭', autoClose: 5_000,
            });
            window.setTimeout(() => {
                app.exit().catch(() => undefined);
            }, 5_000);
        } catch (error) {
            setOperationError((error as Error).message);
            notifications.show({ color: 'red', title: '完成设备配置失败', message: (error as Error).message });
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            <header className="config-header">
                <Group justify="space-between" align="center" gap="xl" wrap="nowrap">
                    <Group gap="sm" wrap="nowrap">
                        <img src="/hydro.png" alt="Hydro" className="config-brand-logo" />
                        <Text fw={800}>Hydro Machine Tools</Text>
                    </Group>
                    <Group gap="sm" wrap="nowrap">
                        <Button variant="default" loading={saving} onClick={() => setFinishMode('force')}>强制完成</Button>
                        <Button className="config-finish-button" loading={saving} onClick={() => setFinishMode('normal')}>完成设备配置</Button>
                    </Group>
                </Group>
            </header>

            <div className="setup-layout">
                <Paper className="section-panel identity-panel" radius="lg" p="xl">
                    <div className="seat-preview">
                        <Text className="seat-number">{cleanSeat || '未设置'}</Text>
                        <Group gap="xs" wrap="nowrap">
                            <IconNetwork size={17} />
                            <Text size="sm" lineClamp={1}>{snapshot?.hostname || '等待读取主机名'} / {ip || '无内网地址'}</Text>
                        </Group>
                    </div>
                    <Stack gap="md" mt="md">
                        <TextInput label="座位号" value={seat} onChange={(event) => setSeat(event.currentTarget.value)} size="md" />
                        <Group grow>
                            <Button variant="light" onClick={() => {
                                showSeat().catch((error) => notifications.show({
                                    color: 'red', title: '放大显示座位号失败', message: error.message,
                                }));
                            }}>
                                放大显示
                            </Button>
                            <Button loading={saving} onClick={() => saveIdentity()}>保存座位号</Button>
                        </Group>
                    </Stack>
                    <Divider my="md" />
                    <VideoQuickControls
                        cameraForced={cameraForced}
                        onReviewed={() => undefined}
                        onOpenDetails={videoControls.open}
                        onOpenMachineInfo={machineControls.open}
                    />
                </Paper>

                <Paper className="section-panel connection-panel" radius="lg" p="xl">
                    <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm">
                        <StatusTile
                            icon={IconWifi}
                            label="设备网络"
                            value={ip || '未连接'}
                            detail={primaryNetwork ? `${primaryNetwork.dev} / ${primaryNetwork.mac}` : '每 5 秒刷新一次内网接口'}
                        />
                        <StatusTile
                            icon={IconActivityHeartbeat}
                            label="HTTP Heartbeat"
                            value={heartbeatTimerActive ? '定时器运行中' : '定时器未运行'}
                            detail="heartbeat.timer"
                        />
                        <StatusTile
                            icon={IconServer}
                            label="heartbeat.service"
                            value={heartbeatServiceResult || '未知'}
                            detail="Result 每 30 秒刷新"
                        />
                        <StatusTile
                            icon={IconDeviceDesktop}
                            label="WebSocket Probe"
                            value={probeServiceLabels[probeServiceState]}
                            detail={probeDetail}
                        />
                    </SimpleGrid>

                    <Divider my="lg" />
                    <Stack gap="md">
                        <TextInput
                            label="服务器地址"
                            placeholder="例如 10.0.0.124:5283"
                            value={serverInput}
                            onChange={(event) => {
                                setServerInput(serverAddressForInput(event.currentTarget.value));
                                setProbeTest(undefined);
                                setOperationError('');
                            }}
                            size="md"
                        />
                        <PasswordInput
                            label="上报 Token"
                            description="同时用于 HTTP 和 WebSocket 上报；服务端 reportToken 为空时这里也留空"
                            value={reportToken}
                            onChange={(event) => setReportToken(event.currentTarget.value)}
                            size="md"
                        />
                        <Group grow>
                            <Button
                                variant="light"
                                loading={testingHeartbeat}
                                onClick={() => testHeartbeat().catch(() => undefined)}
                            >
                                测试 HTTP 上报
                            </Button>
                            <Button loading={saving} onClick={() => saveReporting(false)}>保存上报配置</Button>
                            <Button variant="default" loading={saving} onClick={() => saveReporting(true)}>强制保存</Button>
                        </Group>
                        <Group grow>
                            <Button variant="light" onClick={() => checkHeartbeatVersion(endpoints?.heartbeatUrl || '').then((version) => {
                                notifications.show({ color: 'blue', title: '连接上报中心成功', message: `版本：${version}` });
                            }).catch((error) => notifications.show({ color: 'red', title: '获取中心版本失败', message: error.message }))}>中心状态</Button>
                            <Button variant="default" onClick={() => showHeartbeatService()}>服务状态</Button>
                            <Badge size="lg" variant="light" color={heartbeatServiceResult === 'success' ? 'blue' : 'gray'}>
                                Result={heartbeatServiceResult || 'unknown'}
                            </Badge>
                        </Group>

                        <Divider
                            label={useProbe ? 'WebSocket Probe（当前上报方式）' : 'WebSocket Probe（镜像未安装）'}
                            labelPosition="center"
                        />
                        <Group grow>
                            <Button
                                variant="light"
                                disabled={!useProbe}
                                loading={testingProbe}
                                onClick={() => testProbe().catch(() => undefined)}
                            >
                                测试 WS 上报
                            </Button>
                        </Group>
                        {operationError && <Text size="sm" c="red" role="alert">{operationError}</Text>}
                    </Stack>
                </Paper>
            </div>

            <Modal
                opened={finishMode !== null}
                onClose={() => setFinishMode(null)}
                title={<Text fw={750}>{finishMode === 'force' ? '确认强制完成设备配置' : '确认完成设备配置'}</Text>}
                centered
            >
                <Stack gap="md">
                    <Text>设备座位号：{cleanSeat || '未设置'}</Text>
                    <Text>设备 IP 地址：{ip || '未获取'}</Text>
                    <Text c={finishMode === 'force' ? 'red' : 'dimmed'}>
                        {finishMode === 'force'
                            ? '强制完成会跳过已保存状态、主机名和网络检查，但仍要求有效座位号。'
                            : '请确认座位号与 IP 地址没有异常。'}
                    </Text>
                    <Group justify="flex-end">
                        <Button variant="default" onClick={() => setFinishMode(null)}>取消</Button>
                        <Button
                            color={finishMode === 'force' ? 'red' : 'blue'}
                            loading={saving}
                            onClick={() => {
                                const force = finishMode === 'force';
                                setFinishMode(null);
                                finish(force);
                            }}
                        >
                            确认完成
                        </Button>
                    </Group>
                </Stack>
            </Modal>

            <Drawer opened={machineOpened} onClose={machineControls.close} position="right" size="lg" title={<Text fw={750}>机器信息</Text>}>
                <MachineInfo
                    snapshot={snapshot}
                    probeServiceState={probeServiceState}
                    onSnapshot={onSnapshot}
                    onProbeServiceState={onProbeServiceState}
                />
            </Drawer>
            <Modal
                opened={videoOpened}
                onClose={videoControls.close}
                size="calc(100vw - 56px)"
                title={<Text fw={750}>视频调试</Text>}
                centered
                classNames={{ content: 'video-modal' }}
            >
                <VideoDebug cameraForced={cameraForced} onForceCamera={() => setCameraForced(true)} />
            </Modal>
        </>
    );
}
