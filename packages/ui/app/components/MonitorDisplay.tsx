import {
  Card, Center, Grid, Group,
  HoverCard, Table, Text, ThemeIcon, Title, Tooltip,
} from '@mantine/core';
import { IconCheck, IconX } from '@tabler/icons-react';
import React from 'react';
import { MonitorInfoButton } from './MonitorInfo';

export function MonitorCards({ monitors, openMonitorInfo }) {
  return (
    <Grid>
      {
        monitors.map((m: any) => (
          <Grid.Col key={m._id} span={2} mt="md">
            <Card shadow="sm" padding="lg" radius="md" withBorder>
              <Group justify="center">
                <Title order={3}>
                  {m.name || 'No Name'}
                </Title>
                <Tooltip label={m.updateAt && m.updateAt > new Date().getTime() - 1000 * 120 ? 'Online' : 'Offline'}>
                  <ThemeIcon radius="xl" size="sm" color={m.updateAt && m.updateAt > new Date().getTime() - 1000 * 120 ? 'green' : 'red'}>
                    { m.updateAt && m.updateAt > new Date().getTime() - 1000 * 120 ? (<IconCheck />) : (<IconX />)}
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
                <Text size="sm">Load: {m.load}</Text>
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
  const rows = monitors.map((m: any) => (
    <Table.Tr key={m._id}>
      <Table.Td>
        <Tooltip label={m.updateAt && m.updateAt > new Date().getTime() - 1000 * 120 ? 'Online' : 'Offline'}>
          <ThemeIcon radius="xl" size="sm" color={m.updateAt && m.updateAt > new Date().getTime() - 1000 * 120 ? 'green' : 'red'}>
            { m.updateAt && m.updateAt > new Date().getTime() - 1000 * 120 ? (<IconCheck />) : (<IconX />)}
          </ThemeIcon>
        </Tooltip>
      </Table.Td>
      <Table.Td>{m._id.substring(0, 6).toUpperCase()}</Table.Td>
      <Table.Td>{m.group}</Table.Td>
      <Table.Td>{m.name || 'No Name'}</Table.Td>
      <Table.Td>{m.hostname}</Table.Td>
      <Table.Td>{(m.mac.includes(':') ? m.mac : m.mac.match(/.{1,2}/g).join(':'))}</Table.Td>
      <Table.Td>{m.ip}</Table.Td>
      <Table.Td>
        <Tooltip label={m.version}>
          <Text size="sm">{m.version.substring(0, 8).toUpperCase()}{ m.version.length > 8 ? '...' : '' }</Text>
        </Tooltip>
      </Table.Td>
      <Table.Td>
        { m.cpu
          ? (<HoverCard width={280} shadow="md" position='top' withArrow>
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
          </HoverCard>) : 'No Info' }
      </Table.Td>
      <Table.Td>
        <MonitorInfoButton monitor={m} action={openMonitorInfo} />
      </Table.Td>
    </Table.Tr>
  ));

  return (
    <Table
      horizontalSpacing="md" verticalSpacing="xs" miw={700}
      striped highlightOnHover stickyHeader
    >
      <Table.Thead>
        <Table.Tr>
          <Table.Th></Table.Th>
          <Table.Th>#</Table.Th>
          <Table.Th>Group</Table.Th>
          <Table.Th>Name</Table.Th>
          <Table.Th>Hostname</Table.Th>
          <Table.Th>Mac</Table.Th>
          <Table.Th>IP</Table.Th>
          <Table.Th>Version</Table.Th>
          <Table.Th>Uptime</Table.Th>
          <Table.Th>Actions</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>{rows}</Table.Tbody>
    </Table>
  );
}
