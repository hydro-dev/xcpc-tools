import {
  Card, Center, Grid, Group,
  HoverCard, Text, ThemeIcon, Title, Tooltip,
} from '@mantine/core';
import { IconCheck, IconX } from '@tabler/icons-react';
import { DataTable } from 'mantine-datatable';
import React from 'react';
import { MonitorInfoButton } from './MonitorInfo';

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

export function MonitorCards({ monitors, openMonitorInfo }) {
  const isOnline = (m: any) => m.updateAt && m.updateAt > new Date().getTime() - 1000 * 120;

  return (
    <Grid>
      {monitors.map((m: any) => (
        <Grid.Col key={m._id} span={2} mt="md">
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Group justify="center">
              <Title order={3}>
                {m.name || 'No Name'}
              </Title>
              <Tooltip label={isOnline(m) ? 'Online' : 'Offline'}>
                <ThemeIcon radius="xl" size="sm" color={isOnline(m) ? 'green' : 'red'}>
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
            <Group mt="md" justify="center">
              <MonitorInfoButton monitor={m} action={openMonitorInfo} />
            </Group>
          </Card>
        </Grid.Col>
      ))}
    </Grid>
  );
}

export function MonitorTable({ monitors, openMonitorInfo }) {
  const isOnline = (m: any) => m.updateAt && m.updateAt > new Date().getTime() - 1000 * 120;

  const columns = React.useMemo(() => [
    {
      accessor: 'status',
      title: '',
      width: 50,
      render: (m: any) => (
        <Tooltip label={isOnline(m) ? 'Online' : 'Offline'}>
          <ThemeIcon radius="xl" size="sm" color={isOnline(m) ? 'green' : 'red'}>
            {isOnline(m) ? (<IconCheck />) : (<IconX />)}
          </ThemeIcon>
        </Tooltip>
      ),
    },
    {
      accessor: '_id',
      title: '#',
      width: 80,
      render: (m: any) => m._id.substring(0, 6).toUpperCase(),
    },
    {
      accessor: 'group',
      title: 'Group',
    },
    {
      accessor: 'name',
      title: 'Name',
      render: (m: any) => m.name || 'No Name',
    },
    {
      accessor: 'hostname',
      title: 'Hostname',
    },
    {
      accessor: 'mac',
      title: 'Mac',
      render: (m: any) => (m.mac.includes(':') ? m.mac : m.mac.match(/.{1,2}/g).join(':')),
    },
    {
      accessor: 'ip',
      title: 'IP',
    },
    {
      accessor: 'version',
      title: 'Version',
      render: (m: any) => (
        <Tooltip label={m.version}>
          <Text size="sm">{m.version.substring(0, 8).toUpperCase()}{m.version.length > 8 ? '...' : ''}</Text>
        </Tooltip>
      ),
    },
    {
      accessor: 'uptime',
      title: 'Uptime',
      render: (m: any) => (
        m.cpu
          ? <HoverCard width={280} shadow="md" position='top' withArrow>
            <HoverCard.Target>
              <Text size="sm">
                {new Date((m.uptime || 0) * 1000).toISOString().substring(11, 19)} / {m.load}
              </Text>
            </HoverCard.Target>
            <HoverCard.Dropdown>
              <Text size="sm">CPU: {m.cpu}</Text>
              <Text size="sm">Memory: {(m.mem / 1024 / 1024).toFixed(2)}GB</Text>
              <Text size="sm">OS: {m.os}</Text>
              <Text size="sm">Kernel: {m.kernel}</Text>
              <Text size="sm">CPU Used: {m.cpuUsed ? parseInt(m.cpuUsed, 10).toFixed(2) : 0}%</Text>
              <Text size="sm">Memory Used: {m.memUsed ? (parseInt(m.memUsed, 10) / parseInt(m.mem, 10)).toFixed(2) : 0}%</Text>
              <Text size="sm">Load: {m.load}</Text>
            </HoverCard.Dropdown>
          </HoverCard> : 'No Info'
      ),
    },
    {
      accessor: 'actions',
      title: 'Actions',
      width: 150,
      render: (m: any) => <MonitorInfoButton monitor={m} action={openMonitorInfo} />,
    },
  ], [openMonitorInfo]);

  return (
    <DataTable
      columns={columns}
      records={monitors}
      striped
      highlightOnHover
      withTableBorder
      minHeight={200}
    />
  );
}
