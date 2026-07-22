import {
  ActionIcon, Badge, Group, LoadingOverlay, Stack, Table, Text,
  ThemeIcon, Tooltip,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import {
  IconAwardFilled, IconCheck, IconHourglassEmpty, IconPrinter, IconRefresh, IconSend,
} from '@tabler/icons-react';
import React from 'react';
import './BalloonsTable.css';

interface BalloonRowProps {
  balloon: any;
  refresh: () => unknown;
}

const BalloonRow = React.memo(({ balloon, refresh }: BalloonRowProps) => {
  const [loading, setLoading] = React.useState(false);

  const actions = async (balloonid, operation) => {
    setLoading(true);
    try {
      const response = await fetch('/balloon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ balloonid, operation }),
      });
      if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
      const res = await response.json();
      if (res.error) {
        notifications.show({ title: 'Error', message: `${res.error.message}(${res.error.params})`, color: 'red' });
        return;
      }
      notifications.show({
        title: 'Success',
        message: operation === 'retry_notifier' ? 'Webhook delivery retried' : 'Balloon Updated',
        color: 'green',
      });
    } catch (e) {
      console.error(e);
      notifications.show({
        title: 'Error',
        message: operation === 'retry_notifier' ? 'Webhook delivery failed' : 'Failed to update balloon',
        color: 'red',
      });
    } finally {
      setLoading(false);
    }
    refresh();
  };
  const confirmReprint = () => modals.openConfirmModal({
    title: 'Reprint balloon ticket',
    children: (
      <Text size="sm">
        Reprint balloon #{balloon.balloonid} for {balloon.team || 'this team'}? This may also notify the delivery bot again.
      </Text>
    ),
    labels: { confirm: 'Reprint', cancel: 'Cancel' },
    onConfirm: () => actions(balloon.balloonid, 'reprint'),
  });

  return (
    <Table.Tr key={balloon._id}>
      <Table.Td style={{ width: 40 }}>
        <ThemeIcon
          radius="xl"
          size="sm"
          color={balloon.printDone ? 'green' : balloon.receivedAt ? 'blue' : 'gray'}
          role="img"
          aria-label={balloon.printDone ? 'Done' : balloon.receivedAt ? 'Sent to printer' : 'Waiting'}
        >
          { balloon.printDone ? <IconCheck /> : balloon.receivedAt ? <IconPrinter /> : <IconHourglassEmpty /> }
        </ThemeIcon>
      </Table.Td>
      <Table.Td style={{ width: 180, minWidth: 180, maxWidth: 180 }}>
        <Stack gap={1}>
          <Text size="sm">{new Date(+balloon.time).toLocaleString('zh')}</Text>
          <Text size="xs" c="dimmed" ff="monospace">#{balloon.balloonid}</Text>
        </Stack>
      </Table.Td>
      <Table.Td style={{ width: 130, minWidth: 130, maxWidth: 130, textAlign: 'center' }}>
        <Stack gap={5} align="center">
          <Group gap="xs" wrap="nowrap">
            <Badge
              autoContrast
              color={balloon.contestproblem.rgb}
              size="lg"
              radius="sm"
              miw={56}
            >
              {balloon.problem}
            </Badge>
            {balloon.awards && (
              <Tooltip label={balloon.awards}>
                <IconAwardFilled
                  size={24}
                  color="var(--mantine-color-yellow-6)"
                  role="img"
                  aria-label={balloon.awards}
                />
              </Tooltip>
            )}
          </Group>
          {balloon.awards && (
            <Text size="xs" fw={600} c="yellow.8" lh={1.2}>
              {balloon.awards}
            </Text>
          )}
        </Stack>
      </Table.Td>
      <Table.Td style={{ width: 120, minWidth: 120, maxWidth: 120 }}>{ balloon.location }</Table.Td>
      <Table.Td>
        <Stack gap={3}>
          <Text size="sm" lineClamp={1}>{balloon.team}</Text>
          <Group justify="space-between" align="flex-end" gap="xs" wrap="nowrap">
            <Group gap={3} wrap="wrap" style={{ flex: 1, minWidth: 0 }}>
              {(Object.values(balloon.total) as any[]).map((t) => (
                <Badge
                  key={t.short_name}
                  autoContrast
                  color={t.rgb}
                  size="sm"
                  radius="sm"
                >
                  {t.short_name}
                </Badge>
              ))}
            </Group>
            {balloon.affiliation && (
              <Tooltip label={balloon.affiliation}>
                <Text
                  size="xs"
                  c="dimmed"
                  ta="right"
                  truncate
                  style={{ maxWidth: '40%', minWidth: 0 }}
                >
                  {balloon.affiliation}
                </Text>
              </Tooltip>
            )}
          </Group>
        </Stack>
      </Table.Td>
      <Table.Td className="balloons-table-actions-cell">
        <LoadingOverlay visible={loading} zIndex={1000} overlayProps={{ radius: 'sm', blur: 2 }} />
        <Group justify="center" gap={2} wrap="nowrap">
          {balloon.notifierFailed && (
            <Tooltip label="Retry webhook delivery">
              <ActionIcon
                size="lg"
                variant="subtle"
                color="red"
                aria-label="Retry webhook delivery"
                onClick={() => actions(balloon.balloonid, 'retry_notifier')}
              >
                <IconSend size={22} />
              </ActionIcon>
            </Tooltip>
          )}
          <Tooltip label="Reprint">
            <ActionIcon
              size="lg"
              variant="subtle"
              color="yellow"
              aria-label='Reprint'
              onClick={confirmReprint}
            >
              <IconRefresh size={22} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Table.Td>
    </Table.Tr>
  );
});

export function BalloonsTable({ balloons, refresh }) {
  return (
    <Table.ScrollContainer minWidth={760}>
      <Table
        horizontalSpacing="md" verticalSpacing="xs"
        striped highlightOnHover stickyHeader
      >
        <Table.Thead>
          <Table.Tr>
            <Table.Th aria-label="Status" style={{ width: 40 }} />
            <Table.Th style={{ width: 180, minWidth: 180, maxWidth: 180 }}>Time</Table.Th>
            <Table.Th style={{ width: 130, minWidth: 130, maxWidth: 130, textAlign: 'center' }}>Solved</Table.Th>
            <Table.Th style={{ width: 120, minWidth: 120, maxWidth: 120 }}>Location</Table.Th>
            <Table.Th>Team</Table.Th>
            <Table.Th className="balloons-table-actions-cell balloons-table-actions-header">
              Actions
            </Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>{ balloons.map((balloon) => (
          <BalloonRow
            key={balloon._id}
            balloon={balloon}
            refresh={refresh}
          />
        )) }
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
