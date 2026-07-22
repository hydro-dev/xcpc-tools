import {
  Alert, Badge, Box, Center, Code, Divider, Group, Paper, SimpleGrid, Skeleton,
  Stack, Table, Text, ThemeIcon,
} from '@mantine/core';
import {
  IconAlertCircle, IconBalloon, IconClock, IconId, IconPlugConnected,
  IconPlugConnectedX, IconPrinter,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import React from 'react';
import { PageHeader } from '../components/PageHeader';
import { clientStatusQuery } from '../queries';

type ClientService = 'print' | 'balloon';

interface ClientTaskStatus {
  id: string;
  label: string;
  stage: string;
  printer?: string;
  error?: string;
  updatedAt: number;
}

interface ClientStatusData {
  identity: string;
  services: ClientService[];
  server: string;
  connections: Record<ClientService, {
    connected: boolean;
    lastConnectedAt: number;
    lastError: string;
  }>;
  printers: Array<{
    printer: string;
    status?: string;
    description?: string;
    enabled?: boolean;
  }>;
  current: Record<ClientService, ClientTaskStatus[]>;
  history: Record<ClientService, ClientTaskStatus[]>;
  uptime: number;
  queue: {
    print: number;
    balloon: number;
    completedPrint: number;
    completedBalloon: number;
  };
}

const formatTime = (value?: number) => value ? new Date(value).toLocaleString() : 'Never';

const formatDuration = (value: number) => {
  const seconds = Math.floor(value / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
};

const stageColor = (stage: string) => {
  if (stage === 'done') return 'green';
  if (stage === 'failed') return 'red';
  if (stage === 'printing' || stage === 'confirming') return 'blue';
  return 'gray';
};

function TaskTable({ tasks }: { tasks: ClientTaskStatus[] }) {
  if (!tasks.length) {
    return <Center py="xl"><Text size="sm" c="dimmed">No tasks</Text></Center>;
  }
  return (
    <Table.ScrollContainer minWidth={720}>
      <Table verticalSpacing="sm" highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Task</Table.Th>
            <Table.Th>Stage</Table.Th>
            <Table.Th>Printer</Table.Th>
            <Table.Th>Updated</Table.Th>
            <Table.Th>Error</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {tasks.map((task) => (
            <Table.Tr key={`${task.id}-${task.updatedAt}`}>
              <Table.Td>{task.label}</Table.Td>
              <Table.Td><Badge color={stageColor(task.stage)} variant="light">{task.stage}</Badge></Table.Td>
              <Table.Td>{task.printer || '-'}</Table.Td>
              <Table.Td>{formatTime(task.updatedAt)}</Table.Td>
              <Table.Td c={task.error ? 'red' : 'dimmed'}>{task.error || '-'}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}

function Overview({ status }: { status: ClientStatusData }) {
  const enabledConnections = status.services.map((service) => status.connections[service]);
  const connected = enabledConnections.length > 0 && enabledConnections.every((connection) => connection.connected);
  const lastConnectedAt = Math.max(0, ...enabledConnections.map((connection) => connection.lastConnectedAt));
  const ConnectionIcon = connected ? IconPlugConnected : IconPlugConnectedX;
  return (
    <>
      <Paper withBorder radius="md" mb="md">
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl" p="lg">
          <Group align="flex-start" wrap="nowrap">
            <ThemeIcon size="xl" variant="light" color={connected ? 'green' : 'red'}>
              <ConnectionIcon size={24} />
            </ThemeIcon>
            <Box>
              <Text size="xs" c="dimmed">Server connection</Text>
              <Text size="xl" fw={700}>{connected ? 'Connected' : 'Disconnected'}</Text>
              <Text size="sm" c="dimmed" ff="monospace" mt={2}>{status.server || 'Not configured'}</Text>
              <Group gap="xs" mt="sm">
                {status.services.map((service) => (
                  <Badge key={service} variant="light" color={status.connections[service].connected ? 'green' : 'red'}>
                    {service}: {status.connections[service].connected ? 'connected' : 'disconnected'}
                  </Badge>
                ))}
              </Group>
              <Text size="xs" c="dimmed" mt="xs">Last contact: {formatTime(lastConnectedAt)}</Text>
            </Box>
          </Group>
          <Group align="flex-start" wrap="nowrap">
            <ThemeIcon size="xl" variant="light" color="blue"><IconId size={24} /></ThemeIcon>
            <Box>
              <Text size="xs" c="dimmed">Client identity</Text>
              <Code fz="md" fw={650}>{status.identity}</Code>
              <Text size="sm" c="dimmed" mt="sm">
                Services: {status.services.length ? status.services.join(', ') : 'None enabled'}
              </Text>
            </Box>
          </Group>
        </SimpleGrid>
        <Divider />
        <SimpleGrid cols={{ base: 1, xs: 3 }} spacing="xl" p="lg">
          <Group wrap="nowrap">
            <ThemeIcon variant="light" color="blue"><IconPrinter size={18} /></ThemeIcon>
            <Box>
              <Text size="xs" c="dimmed">Print queue</Text>
              <Text fw={700} ff="monospace">{status.queue.print}</Text>
              <Text size="xs" c="dimmed">{status.queue.completedPrint} completed recently</Text>
            </Box>
          </Group>
          <Group wrap="nowrap">
            <ThemeIcon variant="light" color="orange"><IconBalloon size={18} /></ThemeIcon>
            <Box>
              <Text size="xs" c="dimmed">Balloon queue</Text>
              <Text fw={700} ff="monospace">{status.queue.balloon}</Text>
              <Text size="xs" c="dimmed">{status.queue.completedBalloon} completed recently</Text>
            </Box>
          </Group>
          <Group wrap="nowrap">
            <ThemeIcon variant="light" color="gray"><IconClock size={18} /></ThemeIcon>
            <Box>
              <Text size="xs" c="dimmed">Uptime</Text>
              <Text fw={700} ff="monospace">{formatDuration(status.uptime)}</Text>
              <Text size="xs" c="dimmed">Since this client started</Text>
            </Box>
          </Group>
        </SimpleGrid>
      </Paper>

      {status.services.map((service) => status.connections[service].lastError && (
        <Alert key={service} color="red" mb="md" title={`${service} client error`} icon={<IconAlertCircle />}>
          {status.connections[service].lastError}
        </Alert>
      ))}

      <Paper withBorder radius="md">
        <Group justify="space-between" p="md">
          <Text fw={650}>Printers</Text>
          <Text size="xs" c="dimmed">{status.printers.length} detected</Text>
        </Group>
        <Divider />
        {!status.printers.length ? (
          <Center py="xl"><Text size="sm" c="dimmed">No printers detected</Text></Center>
        ) : (
          <Table.ScrollContainer minWidth={640}>
            <Table verticalSpacing="sm" highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Printer</Table.Th>
                  <Table.Th>Description</Table.Th>
                  <Table.Th>Status</Table.Th>
                  <Table.Th>Enabled</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {status.printers.map((printer) => (
                  <Table.Tr key={printer.printer}>
                    <Table.Td>{printer.printer}</Table.Td>
                    <Table.Td c="dimmed">{printer.description || '-'}</Table.Td>
                    <Table.Td><Badge variant="light">{printer.status || 'unknown'}</Badge></Table.Td>
                    <Table.Td>{printer.enabled ? 'Yes' : 'No'}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Paper>
    </>
  );
}

function ServiceTasks({ status, service }: { status: ClientStatusData; service: ClientService }) {
  const connection = status.connections[service];
  return (
    <Stack gap="md">
      <Paper withBorder radius="md" p="md">
        <Group justify="space-between">
          <div>
            <Text fw={650}>Server connection</Text>
            <Text size="xs" c="dimmed">Last contact: {formatTime(connection.lastConnectedAt)}</Text>
          </div>
          <Badge variant="light" color={connection.connected ? 'green' : 'red'}>
            {connection.connected ? 'Connected' : 'Disconnected'}
          </Badge>
        </Group>
        {connection.lastError && <Text size="sm" c="red" mt="sm">{connection.lastError}</Text>}
      </Paper>
      <Paper withBorder radius="md">
        <Group justify="space-between" p="md">
          <Text fw={650}>Current</Text>
          <Text size="xs" c="dimmed">{status.current[service].length} active</Text>
        </Group>
        <Divider />
        <TaskTable tasks={status.current[service]} />
      </Paper>
      <Paper withBorder radius="md">
        <Group justify="space-between" p="md">
          <Text fw={650}>Recent results</Text>
          <Text size="xs" c="dimmed">Latest 100</Text>
        </Group>
        <Divider />
        <TaskTable tasks={status.history[service]} />
      </Paper>
    </Stack>
  );
}

export default function ClientStatus({ service }: { service?: ClientService }) {
  const query = useQuery<ClientStatusData>({
    ...clientStatusQuery(),
    refetchInterval: 2_000,
  });
  const label = service === 'print' ? 'Print' : service === 'balloon' ? 'Balloon' : 'Client overview';
  return (
    <>
      <PageHeader
        title={label}
        description={service
          ? `Current and recent ${service} delivery tasks on this client.`
          : 'Local delivery services, queues, and attached printers.'}
        isFetching={query.isFetching && !query.isPending}
        updatedAt={query.dataUpdatedAt}
      />
      {query.isError && (
        <Alert color="red" mb="md" title="Unable to load client status" icon={<IconAlertCircle />}>
          The local status endpoint did not respond.
        </Alert>
      )}
      {query.isPending && <Skeleton h={260} radius="md" />}
      {query.data && (service
        ? <ServiceTasks status={query.data} service={service} />
        : <Overview status={query.data} />)}
    </>
  );
}
