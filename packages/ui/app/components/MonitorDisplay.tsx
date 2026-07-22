import {
  Card, Center, Grid, Group, Stack, Table,
  Text, ThemeIcon, Title, Tooltip,
} from '@mantine/core';
import { IconCheck, IconX } from '@tabler/icons-react';
import React from 'react';
import { formatWifiSignal } from '../utils';
import { MonitorInfoButton } from './MonitorInfo';
import './MonitorDisplay.css';

function getLastOnlineTime(updateAt: number | undefined): string {
  if (!updateAt) return '未知';
  const now = new Date().getTime();
  const diff = now - updateAt;
  const minutes = Math.floor(diff / (1000 * 60));
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  return `${days}天前`;
}

const isOnline = (monitor: any) => monitor.updateAt && monitor.updateAt > Date.now() - 1000 * 120;

interface MonitorDisplayProps {
  monitors: any[];
  openMonitorInfo: (monitor: any, tab?: string) => void;
}

export const MonitorCards = React.memo(({ monitors, openMonitorInfo }: MonitorDisplayProps) => (
  <Grid>
    {monitors.map((m: any) => (
      <Grid.Col key={m._id} span={{
        base: 12, xs: 6, md: 4, xl: 3,
      }}>
        <Card padding="md" radius="md" withBorder>
          <Group justify="center">
            <Title order={3}>
              {m.name || 'No Name'}
            </Title>
            <Tooltip label={isOnline(m) ? 'Online' : 'Offline'}>
              <ThemeIcon
                radius="xl"
                size="sm"
                color={isOnline(m) ? 'green' : 'red'}
                role="img"
                aria-label={isOnline(m) ? 'Online' : 'Offline'}
              >
                {isOnline(m) ? (<IconCheck />) : (<IconX />)}
              </ThemeIcon>
            </Tooltip>
          </Group>
          <Center>
            <Text c="dimmed">{m.ip}</Text>
          </Center>
          <Center>
            <Text size="sm">UpTime: {new Date((m.uptime || 0) * 1000).toISOString().substring(11, 19)}</Text>
          </Center>
          <Center>
            <Text size="sm">
              {isOnline(m) ? `Load: ${m.load}` : `上次在线: ${getLastOnlineTime(m.updateAt)}`}
            </Text>
          </Center>
          { formatWifiSignal(m.wifiSignal) && (
            <Center>
              <Text size="sm">Wi-Fi Signal: {formatWifiSignal(m.wifiSignal)}</Text>
            </Center>
          )}
          { m.wifiBssid && (
            <Center>
              <Text size="sm">Wi-Fi BSSID: {m.wifiBssid}</Text>
            </Center>
          )}
          <Group mt="md" justify="center">
            <MonitorInfoButton monitor={m} action={openMonitorInfo} />
          </Group>
        </Card>
      </Grid.Col>
    ))}
  </Grid>
));

interface MonitorRowProps {
  monitor: any;
  online: boolean;
  openMonitorInfo: (monitor: any, tab?: string) => void;
}

const MonitorRow = React.memo(({ monitor, online, openMonitorInfo }: MonitorRowProps) => (
  <Table.Tr>
    <Table.Td style={{ width: 40 }}>
      <ThemeIcon
        radius="xl"
        size="sm"
        color={online ? 'green' : 'red'}
        role="img"
        aria-label={online ? 'Online' : 'Offline'}
        title={online ? 'Online' : 'Offline'}
      >
        {online ? <IconCheck /> : <IconX />}
      </ThemeIcon>
    </Table.Td>
    <Table.Td>
      <Stack gap={1}>
        <Text size="sm">{monitor.name || 'No Name'}</Text>
        <Text size="xs" c="dimmed" ff="monospace">{monitor._id.substring(0, 6).toUpperCase()}</Text>
      </Stack>
    </Table.Td>
    <Table.Td>{monitor.group}</Table.Td>
    <Table.Td>{monitor.hostname}</Table.Td>
    <Table.Td style={{ width: 170, minWidth: 170 }}>
      <Stack gap={1}>
        <Text size="sm">{monitor.ip || 'Unknown'}</Text>
        <Text size="xs" c="dimmed" ff="monospace">
          {monitor.mac
            ? (monitor.mac.includes(':') ? monitor.mac : monitor.mac.match(/.{1,2}/g)?.join(':'))
            : 'Unknown'}
        </Text>
      </Stack>
    </Table.Td>
    <Table.Td style={{ width: 110, minWidth: 110, whiteSpace: 'nowrap' }}>
      <Text size="sm">{formatWifiSignal(monitor.wifiSignal) || 'wired'}</Text>
    </Table.Td>
    <Table.Td style={{ width: 120, minWidth: 120, whiteSpace: 'nowrap' }}>
      <Stack gap={1}>
        <Text size="sm">{new Date((monitor.uptime || 0) * 1000).toISOString().substring(11, 19)}</Text>
        <Text size="xs" c="dimmed">Load: {monitor.load ?? 'Unknown'}</Text>
      </Stack>
    </Table.Td>
    <Table.Td className="monitor-table-actions-cell">
      <MonitorInfoButton monitor={monitor} action={openMonitorInfo} />
    </Table.Td>
  </Table.Tr>
));

export const MonitorTable = React.memo(({ monitors, openMonitorInfo }: MonitorDisplayProps) => (
  <Table.ScrollContainer minWidth={1050}>
    <Table horizontalSpacing="md" verticalSpacing="xs" striped highlightOnHover stickyHeader>
      <Table.Thead>
        <Table.Tr>
          <Table.Th aria-label="Status" style={{ width: 40 }} />
          <Table.Th>Name</Table.Th>
          <Table.Th>Group</Table.Th>
          <Table.Th>Hostname</Table.Th>
          <Table.Th style={{ width: 170, minWidth: 170 }}>Network</Table.Th>
          <Table.Th style={{ width: 110, minWidth: 110, whiteSpace: 'nowrap' }}>Wi-Fi Signal</Table.Th>
          <Table.Th style={{ width: 120, minWidth: 120, whiteSpace: 'nowrap' }}>Runtime</Table.Th>
          <Table.Th className="monitor-table-actions-cell monitor-table-actions-header">Actions</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {monitors.map((monitor) => (
          <MonitorRow
            key={monitor._id}
            monitor={monitor}
            online={isOnline(monitor)}
            openMonitorInfo={openMonitorInfo}
          />
        ))}
      </Table.Tbody>
    </Table>
  </Table.ScrollContainer>
));
