import {
    Alert, Button, Group, Modal, Radio, Stack, Table, Text,
} from '@mantine/core';
import { useEffect, useMemo, useState } from 'react';
import type { QuickConfig } from '../utils/quickConfig';
import { parseQuickConfig } from '../utils/quickConfig';
import type { NetworkConfig, NetworkTarget } from '../utils/quickNetwork';
import { applyNetwork, previewNetwork, readNetworkConfig } from '../utils/quickNetwork';
import { CameraScanner } from './CameraScanner';

interface QuickConfigModalProps {
    onClose: () => void;
    onApply: (config: QuickConfig) => Promise<void>;
}

const labels: Record<string, string> = {
    seat: '座位号', server: '中心地址', ip: 'IPv4 地址/前缀', gateway: '网关', dns: 'DNS',
};
const targetValue = (target: NetworkTarget) => `${target.kind}:${target.id}:${target.device.name}`;

export function QuickConfigModal({ onClose, onApply }: QuickConfigModalProps) {
    const [config, setConfig] = useState<QuickConfig>();
    const [scanning, setScanning] = useState(true);
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);
    const [networkConfig, setNetworkConfig] = useState<NetworkConfig>();
    const [targetKey, setTargetKey] = useState<string | null>(null);
    const [readingNetwork, setReadingNetwork] = useState(false);
    const [networkError, setNetworkError] = useState('');
    const [networkReadVersion, setNetworkReadVersion] = useState(0);
    const network = config?.network;
    useEffect(() => {
        let cancelled = false;
        setNetworkConfig(undefined);
        setTargetKey(null);
        setNetworkError('');
        setReadingNetwork(Boolean(network));
        if (network) {
            void readNetworkConfig().then((current) => {
                if (cancelled) return;
                setNetworkConfig(current);
            }).catch((reason) => {
                if (!cancelled) setNetworkError((reason as Error).message);
            }).finally(() => {
                if (!cancelled) setReadingNetwork(false);
            });
        }
        return () => { cancelled = true; };
    }, [network, networkReadVersion]);
    const target = networkConfig?.targets.find((entry) => targetValue(entry) === targetKey);
    const preparedNetwork = useMemo(() => {
        if (!network || !networkConfig || !target) return {};
        try {
            return { preview: previewNetwork(networkConfig, network, target) };
        } catch (reason) {
            return { error: (reason as Error).message };
        }
    }, [network, networkConfig, target]);
    const canApply = Boolean(config && !scanning && (!network || (!readingNetwork && preparedNetwork.preview)));

    const load = (value: string) => {
        if (busy) return false;
        try {
            setConfig(parseQuickConfig(value));
            setScanning(false);
            setError('');
            return true;
        } catch (reason) {
            setError((reason as Error).message);
            return false;
        }
    };

    const apply = async () => {
        if (busy || !canApply || !config) return;
        setBusy(true);
        setScanning(false);
        setError('');
        let networkApplied = false;
        try {
            if (preparedNetwork.preview) {
                await applyNetwork(preparedNetwork.preview);
                networkApplied = true;
            }
            await onApply(config);
            onClose();
        } catch (reason) {
            setNetworkConfig(undefined);
            setTargetKey(null);
            setError(`${networkApplied ? '网络已应用。' : ''}${(reason as Error).message}`);
        } finally {
            setBusy(false);
        }
    };

    const changes = [
        ...config?.seat ? [['seat', config.seat]] : [],
        ...config?.server ? [['server', config.server]] : [],
        ...Object.entries(network || {}).map(([field, value]) => [field, Array.isArray(value) ? value.join('、') : value]),
    ];

    return (
        <Modal opened centered onClose={() => { if (!busy) onClose(); }} title="快速配置" size="lg" closeOnClickOutside={false}>
            <Stack gap="md">
                {scanning && <CameraScanner onResult={load} onError={(message) => { setError(message); setScanning(false); }} />}
                <Group justify="center">
                    <Button
                        variant="default"
                        disabled={busy}
                        onClick={() => {
                            setConfig(undefined);
                            setError('');
                            setScanning((value) => !value);
                        }}
                    >
                        {scanning ? '停止扫码' : config ? '重新扫码' : '继续扫码'}
                    </Button>
                    <Button loading={busy} disabled={!canApply} onClick={() => { void apply(); }}>确认修改</Button>
                </Group>
                {config && (
                    <>
                        <Text size="sm" c="dimmed" ta="center">将修改以下配置，未列出的项目保持原值。</Text>
                        <Table>
                            <Table.Thead><Table.Tr><Table.Th>配置项</Table.Th><Table.Th>将修改为</Table.Th></Table.Tr></Table.Thead>
                            <Table.Tbody>
                                {changes.map(([field, value]) => (
                                    <Table.Tr key={field}>
                                        <Table.Td>{labels[field]}</Table.Td>
                                        <Table.Td style={{ overflowWrap: 'anywhere' }}>{value}</Table.Td>
                                    </Table.Tr>
                                ))}
                            </Table.Tbody>
                        </Table>
                    </>
                )}
                {network && (
                    <Stack gap="xs">
                        {readingNetwork ? <Text size="sm" c="dimmed">正在读取网络配置…</Text> : (
                            <Radio.Group label="应用到网卡" value={targetKey || ''} onChange={setTargetKey}>
                                <Stack gap="xs" mt="xs">
                                    {(networkConfig?.targets || []).map((entry) => (
                                        <Radio
                                            key={targetValue(entry)}
                                            value={targetValue(entry)}
                                            label={`${entry.device.name} · ${entry.device.ipv4.join(', ') || '暂无 IPv4'}`}
                                            description={[
                                                entry.kind === 'ethernets' ? '有线' : 'WiFi', `MAC ${entry.device.mac}`,
                                                entry.device.isDefault ? '默认出口' : '',
                                            ].filter(Boolean).join(' · ')}
                                            disabled={busy}
                                        />
                                    ))}
                                </Stack>
                            </Radio.Group>
                        )}
                        {preparedNetwork.error && <Alert color="red">{preparedNetwork.error}</Alert>}
                        {networkError && <Alert color="red">{networkError}</Alert>}
                        {networkConfig?.targets.length === 0 && <Text size="sm">没有找到真实有线或 WiFi 网卡，请检查网络接入。</Text>}
                        <Group>
                            <Button
                                size="xs"
                                variant="subtle"
                                disabled={busy || readingNetwork}
                                onClick={() => setNetworkReadVersion((value) => value + 1)}
                            >
                                重新读取网络
                            </Button>
                        </Group>
                    </Stack>
                )}
                {error && <Alert color="red">{error}</Alert>}
            </Stack>
        </Modal>
    );
}
