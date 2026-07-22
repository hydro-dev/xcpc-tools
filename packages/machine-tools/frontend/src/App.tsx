import {
    Box, Center, Loader, MantineProvider, Stack, Text,
} from '@mantine/core';
import { useColorScheme } from '@mantine/hooks';
import { Notifications, notifications } from '@mantine/notifications';
import {
    useCallback, useEffect, useState,
} from 'react';
import { PresentationPage } from './components/PresentationPage';
import { SetupPanel } from './components/SetupPanel';
import type {
    MachineSnapshot, MachineToolsConfig, ProbeServiceState,
} from './types';
import { hasPresentationArgument } from './utils/mode';
import {
    collectMachineSnapshot, getNetworkInfo, getProbeServiceState, isPrivateIPv4, readMachineToolsConfig,
} from './utils/system';

function LoadingScreen() {
    return (
        <Center mih="100dvh">
            <Stack align="center" gap="md">
                <Loader color="blue" />
                <Text c="dimmed">正在读取本机配置</Text>
            </Stack>
        </Center>
    );
}

function MachineToolsConfigApp() {
    const [config, setConfig] = useState<MachineToolsConfig>({});
    const [snapshot, setSnapshot] = useState<MachineSnapshot>();
    const [probeServiceState, setProbeServiceState] = useState<ProbeServiceState>('unknown');
    const [ready, setReady] = useState(false);

    useEffect(() => {
        let cancelled = false;
        Promise.all([
            readMachineToolsConfig().catch((error) => {
                notifications.show({ color: 'red', title: '读取本地配置失败', message: (error as Error).message });
                return {} as MachineToolsConfig;
            }),
            collectMachineSnapshot().catch((error) => {
                notifications.show({ color: 'yellow', title: '读取机器信息失败', message: (error as Error).message });
                return undefined;
            }),
            getProbeServiceState(),
        ]).then(([loadedConfig, machineSnapshot, serviceState]) => {
            if (cancelled) return;
            setConfig(loadedConfig);
            setSnapshot(machineSnapshot);
            setProbeServiceState(serviceState);
        }).finally(() => {
            if (!cancelled) setReady(true);
        });
        return () => { cancelled = true; };
    }, []);

    const refreshNetwork = useCallback(async () => {
        if (!snapshot) {
            setSnapshot(await collectMachineSnapshot());
            return;
        }
        const networks = await getNetworkInfo();
        setSnapshot((current) => {
            if (!current) return current;
            const primary = networks.find((network) => network.isDefault) || networks[0];
            const privateIp = networks.flatMap((network) => network.ipv4).find(isPrivateIPv4) || '';
            return {
                ...current,
                networks,
                mac: primary?.mac || current.mac,
                ip: privateIp,
            };
        });
    }, [snapshot]);

    useEffect(() => {
        if (!ready) return undefined;
        const interval = window.setInterval(() => {
            refreshNetwork().catch(() => undefined);
        }, 5_000);
        return () => window.clearInterval(interval);
    }, [ready, refreshNetwork]);

    if (!ready) return <LoadingScreen />;
    return (
        <Box className="config-app">
            <main className="config-shell">
                <SetupPanel
                    config={config}
                    snapshot={snapshot}
                    probeServiceState={probeServiceState}
                    onConfigChange={setConfig}
                    onSnapshot={setSnapshot}
                    onProbeServiceState={setProbeServiceState}
                />
            </main>
        </Box>
    );
}

export default function App() {
    const colorScheme = useColorScheme();
    return (
        <MantineProvider
            defaultColorScheme="auto"
            forceColorScheme={colorScheme}
            theme={{
                primaryColor: 'blue',
                defaultRadius: 'md',
                fontFamily: '"Noto Sans SC", "Segoe UI", system-ui, sans-serif',
                headings: { fontFamily: '"Noto Sans SC", "Segoe UI", system-ui, sans-serif', fontWeight: '750' },
            }}
        >
            <Notifications position="top-right" />
            {hasPresentationArgument(Array.isArray(window.NL_ARGS) ? window.NL_ARGS : [])
                ? <PresentationPage />
                : <MachineToolsConfigApp />}
        </MantineProvider>
    );
}
