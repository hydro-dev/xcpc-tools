import {
  Badge, Box, Group, Paper, Skeleton, Stack, Text, ThemeIcon,
} from '@mantine/core';
import {
  IconBalloon, IconPrinter, IconSend2, IconServer,
} from '@tabler/icons-react';
import React from 'react';

const formatClientDate = (value?: number | null) => (
  value ? new Date(value).toLocaleString('zh') : 'Never connected'
);

const printerStatusColor = (status = '') => {
  const normalized = status.toLowerCase();
  if (normalized === 'idle') return 'green';
  if (normalized === 'busy' || normalized === 'printing') return 'blue';
  if (normalized === 'error' || normalized === 'stopped' || normalized === 'offline') return 'red';
  return 'gray';
};

function ServiceClientCard({ client }: { client: any }) {
  const services = client.services || [];
  const supportsPrint = services.includes('printer');
  const supportsReceipt = services.includes('balloon');
  const Icon = supportsPrint && supportsReceipt ? IconServer : supportsPrint ? IconPrinter : IconBalloon;
  const color = supportsPrint ? 'teal' : 'orange';
  return (
    <Paper withBorder radius="md" p="sm">
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
          <ThemeIcon color={color} variant="light" size="lg"><Icon size={20} /></ThemeIcon>
          <Box style={{ minWidth: 0 }}>
            <Text fw={650} size="sm" truncate>{client.name}</Text>
            <Group gap={4} mt={3}>
              {supportsPrint && <Badge size="xs" variant="light" color="teal">Print</Badge>}
              {supportsReceipt && <Badge size="xs" variant="light" color="orange">Receipt</Badge>}
            </Group>
          </Box>
        </Group>
        <Badge size="sm" variant="light" color={client.online ? 'green' : 'red'}>
          {client.online ? 'Online' : 'Offline'}
        </Badge>
      </Group>
      <Stack gap={1} mt="sm">
        <Text size="xs" c="dimmed">IP: {client.ip || '-'}</Text>
        <Text size="xs" c="dimmed">Updated At: {formatClientDate(client.lastConnectedAt)}</Text>
      </Stack>
      {supportsPrint && (
        <Stack gap={6} mt="sm">
          {(client.printers || []).map((printer) => (
            <Group key={printer.name} justify="space-between" gap="xs" wrap="nowrap">
              <Box style={{ minWidth: 0, flex: 1 }}>
                <Text size="xs" truncate>{printer.name}</Text>
                {printer.description && <Text size="xs" c="dimmed" truncate>{printer.description}</Text>}
              </Box>
              <Group gap={4} wrap="nowrap">
                <Badge size="sm" variant="light" color={printer.group ? 'blue' : 'gray'}>
                  {printer.group || 'All'}
                </Badge>
                <Badge size="sm" variant="light" color={printerStatusColor(printer.status)}>
                  {printer.status}
                </Badge>
              </Group>
            </Group>
          ))}
          {!client.printers?.length && <Text size="xs" c="dimmed">No printers reported</Text>}
        </Stack>
      )}
    </Paper>
  );
}

const notifierName = (subType: string) => ({
  telegram: 'Telegram',
  discord: 'Discord',
  wxwork: 'WXWork',
  dingtalk: 'DingTalk',
  lark: 'Lark',
}[subType] || subType);

function WebhookClientCard({ client }: { client: any }) {
  const failed = Boolean(client.lastError);
  const status = client.enabled === false ? 'Disabled' : failed ? 'Delivery error' : client.loaded ? 'Ready' : 'Load error';
  const statusColor = client.enabled === false ? 'gray' : failed || !client.loaded ? 'red' : 'green';
  const activityAt = client.lastSuccessAt || client.lastAttemptAt;
  const activityLabel = client.lastSuccessAt ? 'Last delivery' : 'Last attempt';
  return (
    <Paper withBorder radius="md" p="sm">
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
          <ThemeIcon color="blue" variant="light" size="lg"><IconSend2 size={20} /></ThemeIcon>
          <Box style={{ minWidth: 0 }}>
            <Text fw={650} size="sm" truncate>{client.name}</Text>
            <Badge size="xs" variant="light" mt={3}>{notifierName(client.subType)}</Badge>
          </Box>
        </Group>
        <Badge size="sm" variant="light" color={statusColor}>{status}</Badge>
      </Group>
      <Text size="xs" c="dimmed" mt="sm">
        {activityLabel}: {formatClientDate(activityAt)}
      </Text>
      {client.lastError && <Text size="xs" c="red" mt={4} lineClamp={2}>{client.lastError}</Text>}
    </Paper>
  );
}

export function DashboardClients({ data, pending }: { data: any; pending: boolean }) {
  const services = data?.services || [];
  const webhooks = data?.webhooks || [];
  return (
    <Paper withBorder radius="md" p="md">
      <Group justify="space-between">
        <div>
          <Text fw={700}>Clients</Text>
          <Text size="xs" c="dimmed">Print, receipt and webhook delivery</Text>
        </div>
        <Badge variant="light" color="gray">{services.length + webhooks.length}</Badge>
      </Group>
      {pending ? (
        <Stack gap="sm" mt="md">
          <Skeleton h={104} radius="md" />
          <Skeleton h={104} radius="md" />
        </Stack>
      ) : !services.length && !webhooks.length ? (
        <Text size="sm" c="dimmed" ta="center" py="xl">No clients configured</Text>
      ) : (
        <Stack gap="md" mt="md">
          {!!services.length && (
            <Stack gap="sm">
              {services.map((client) => <ServiceClientCard key={client.name} client={client} />)}
            </Stack>
          )}
          {!!webhooks.length && (
            <Stack gap="sm">
              <Text size="sm" fw={600}>Webhook clients</Text>
              {webhooks.map((client) => <WebhookClientCard key={client.id} client={client} />)}
            </Stack>
          )}
        </Stack>
      )}
    </Paper>
  );
}
