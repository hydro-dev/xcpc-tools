import React from 'react';
import {
  Card, Center, Grid, Group,
  Table, Text, ThemeIcon, Title, Tooltip,
} from '@mantine/core';
import { IconCheck, IconX } from '@tabler/icons-react';
import { MonitorInfo } from './MonitorInfoModal';

export function MonitorCards({ monitors, refresh }) {
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

                <Tooltip label={m.updateAt || m.updateAt > new Date().getTime() - 1000 * 60 ? 'Online' : 'Offline'}>
                  <ThemeIcon radius="xl" size="sm" color={m.updateAt || m.updateAt > new Date().getTime() - 1000 * 60 ? 'green' : 'red'}>
                    { m.updateAt ? (<IconCheck />) : (<IconX />)}
                  </ThemeIcon>
                </Tooltip>
              </Group>
              <Center>
                <Text c="dimmed">{m.ip}</Text>
              </Center>
              <Center>
                <Text size="sm">UpTime: {new Date((m.uptime || 0) * 1000).toISOString().substring(11, 19)}</Text>
              </Center>
              <Group mt="md" justify="center">
                <MonitorInfo refresh={refresh} monitor={m} />
              </Group>
            </Card>
          </Grid.Col>
        ))}
    </Grid>
  );
}

export function MonitorTable({ monitors, refresh }) {
  const rows = monitors.map((m: any) => (
    <Table.Tr key={m._id}>
      <Table.Td>
        <Tooltip label={m.updateAt || m.updateAt > new Date().getTime() - 1000 * 60 ? 'Online' : 'Offline'}>
          <ThemeIcon radius="xl" size="sm" color={m.updateAt || m.updateAt > new Date().getTime() - 1000 * 60 ? 'green' : 'red'}>
            { m.updateAt ? (<IconCheck />) : (<IconX />)}
          </ThemeIcon>
        </Tooltip>
      </Table.Td>
      <Table.Td>{m._id.substring(0, 6).toUpperCase()}</Table.Td>
      <Table.Td>{m.group}</Table.Td>
      <Table.Td>{m.name || 'No Name'}</Table.Td>
      <Table.Td>{m.seats}</Table.Td>
      <Table.Td>{(m.mac.includes(':') ? m.mac : m.mac.match(/.{1,2}/g).join(':'))}</Table.Td>
      <Table.Td>{m.ip}</Table.Td>
      <Table.Td>{new Date((m.uptime || 0) * 1000).toISOString().substring(11, 19)}</Table.Td>
      <Table.Td>{m.version}</Table.Td>
      <Table.Td>
        { m.cpu
          ? (<Tooltip multiline w={300}
            label={`CPU: ${m.cpu} RAM: ${m.mem} OS: ${m.os} Kernel: ${m.kernel} Load: ${m.load}`}>
            <Text size="sm">
              {m.cpuUsage}%/
              {m.memUsage ? (m.memUsage.match(/(\d+)/)[0] / m.mem.match(/(\d+)/)[0] * 100).toFixed(2) : 0}%
            </Text>
          </Tooltip>) : 'No Info' }
      </Table.Td>
      <Table.Td><MonitorInfo refresh={refresh} monitor={m} /></Table.Td>
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
          <Table.Th>HostName</Table.Th>
          <Table.Th>Mac</Table.Th>
          <Table.Th>IP</Table.Th>
          <Table.Th>Uptime</Table.Th>
          <Table.Th>Version</Table.Th>
          <Table.Th>Machine Info</Table.Th>
          <Table.Th>Actions</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>{rows}</Table.Tbody>
    </Table>
  );
}
