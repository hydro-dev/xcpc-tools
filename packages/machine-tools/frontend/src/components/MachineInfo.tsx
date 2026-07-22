import {
    Button, Code, Group, Paper, SimpleGrid, Stack, Text,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconRefresh } from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';
import type { MachineSnapshot, ProbeServiceState } from '../types';
import {
    collectMachineSnapshot, commandVersion, getProbeServiceState,
} from '../utils/system';

interface MachineInfoProps {
    snapshot?: MachineSnapshot;
    probeServiceState: ProbeServiceState;
    onSnapshot: (snapshot: MachineSnapshot) => void;
    onProbeServiceState: (state: ProbeServiceState) => void;
}

interface ToolVersions {
    gcc: string;
    gpp: string;
    java: string;
    kotlin: string;
    python: string;
    pypy: string;
}

function InfoBlock({ label, value }: { label: string; value?: string | number }) {
    return (
        <div className="machine-info-block">
            <Text size="xs" fw={700} c="dimmed">{label}</Text>
            <Text fw={650} mt={4}>{value || 'Unknown'}</Text>
        </div>
    );
}

export function MachineInfo({
    snapshot, probeServiceState, onSnapshot, onProbeServiceState,
}: MachineInfoProps) {
    const [loading, setLoading] = useState(false);
    const [tools, setTools] = useState<ToolVersions>();

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const [nextSnapshot, versions, serviceState] = await Promise.all([
                collectMachineSnapshot(),
                Promise.all([
                    commandVersion('gcc --version', /[0-9]+\.[0-9]+(?:\.[0-9]+)?/),
                    commandVersion('g++ --version', /[0-9]+\.[0-9]+(?:\.[0-9]+)?/),
                    commandVersion('java -version', /[0-9]+\.[0-9]+(?:\.[0-9]+)?/),
                    commandVersion('kotlin -version', /[0-9]+\.[0-9]+(?:\.[0-9]+)?/),
                    commandVersion('python3 --version', /[0-9]+\.[0-9]+(?:\.[0-9]+)?/),
                    commandVersion('pypy3 --version', /[0-9]+\.[0-9]+(?:\.[0-9]+)?/),
                ]),
                getProbeServiceState(),
            ]);
            onSnapshot(nextSnapshot);
            onProbeServiceState(serviceState);
            setTools({
                gcc: versions[0],
                gpp: versions[1],
                java: versions[2],
                kotlin: versions[3],
                python: versions[4],
                pypy: versions[5],
            });
        } finally {
            setLoading(false);
        }
    }, [onProbeServiceState, onSnapshot]);

    const runRefresh = useCallback(() => {
        refresh().catch((error) => notifications.show({
            color: 'red',
            title: '机器信息刷新失败',
            message: (error as Error).message,
        }));
    }, [refresh]);

    useEffect(runRefresh, [runRefresh]);

    return (
        <Stack gap="lg">
            <Group justify="space-between">
                <Text size="sm" c="dimmed">系统、网络与编译环境的只读摘要</Text>
                <Button variant="light" loading={loading} leftSection={<IconRefresh size={17} />} onClick={runRefresh}>
                    刷新
                </Button>
            </Group>
            <Paper withBorder radius="md" p="lg">
                <Text fw={750} mb="md">设备</Text>
                <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="lg">
                    <InfoBlock label="Hostname" value={snapshot?.hostname} />
                    <InfoBlock label="Image" value={snapshot?.imageVersion} />
                    <InfoBlock label="CPU" value={snapshot?.cpu} />
                    <InfoBlock
                        label="Memory"
                        value={snapshot ? [
                            `P: ${((snapshot.memoryAvailable || 0) / 1024 / 1024).toFixed(2)} GB`,
                            `${(snapshot.memory / 1024 / 1024).toFixed(2)} GB`,
                        ].join(' / ') : undefined}
                    />
                    <InfoBlock
                        label="Swap"
                        value={snapshot ? [
                            `S: ${((snapshot.swapAvailable || 0) / 1024 / 1024).toFixed(2)} GB`,
                            `${((snapshot.swapMemory || 0) / 1024 / 1024).toFixed(2)} GB`,
                        ].join(' / ') : undefined}
                    />
                    <InfoBlock label="OS" value={snapshot?.os} />
                    <InfoBlock label="Kernel" value={snapshot?.kernel} />
                    <InfoBlock label="Displays" value={snapshot?.displays} />
                    <InfoBlock label="Uptime" value={snapshot ? `${Math.floor(snapshot.uptime / 3600)} h` : undefined} />
                    <InfoBlock label="Probe service" value={probeServiceState} />
                </SimpleGrid>
            </Paper>
            <Paper withBorder radius="md" p="lg">
                <Text fw={750} mb="md">编译环境</Text>
                <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="lg">
                    <InfoBlock label="gcc" value={tools?.gcc} />
                    <InfoBlock label="g++" value={tools?.gpp} />
                    <InfoBlock label="Java" value={tools?.java} />
                    <InfoBlock label="Kotlin" value={tools?.kotlin} />
                    <InfoBlock label="Python 3" value={tools?.python} />
                    <InfoBlock label="PyPy 3" value={tools?.pypy} />
                </SimpleGrid>
            </Paper>
            <Paper withBorder radius="md" p="lg">
                <Text fw={750} mb="md">网络接口</Text>
                <Stack gap="md">
                    {snapshot?.networks.length ? snapshot.networks.map((network) => (
                        <div key={network.dev} className="network-row">
                            <Group justify="space-between" gap="md">
                                <Text fw={700}>{network.dev}</Text>
                                <Code>{network.mac}</Code>
                            </Group>
                            <Text size="sm" mt="xs">IPv4: {network.ipv4.join(', ') || 'None'}</Text>
                            <Text size="sm" c="dimmed">IPv6: {network.ipv6.join(', ') || 'None'}</Text>
                        </div>
                    )) : <Text c="dimmed">没有可用网络接口</Text>}
                </Stack>
            </Paper>
        </Stack>
    );
}
