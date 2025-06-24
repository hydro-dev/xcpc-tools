import {
  ActionIcon, Badge, Group, LoadingOverlay, Table,
  ThemeIcon, Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconCheck, IconHourglassEmpty, IconPrinter, IconRefresh,
} from '@tabler/icons-react';
import React from 'react';

function BalloonRow({ balloon, refresh }) {
  const [loading, setLoading] = React.useState(false);

  const actions = async (balloonid, operation) => {
    setLoading(true);
    try {
      const res = await (await fetch('/balloon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ balloonid, operation }),
      })).json();
      if (res.error) {
        notifications.show({ title: 'Error', message: `${res.error.message}(${res.error.params})`, color: 'red' });
        return;
      }
      notifications.show({ title: 'Success', message: 'Balloon Updated', color: 'green' });
    } catch (e) {
      console.error(e);
      notifications.show({ title: 'Error', message: 'Failed to update balloon', color: 'red' });
    }
    setLoading(false);
    refresh();
  };

  return (
    <Table.Tr key={balloon._id}>
      <Table.Td>
        <ThemeIcon radius="xl" size="sm" color={balloon.printDone ? 'green' : balloon.receivedAt ? 'blue' : 'gray'}>
          { balloon.printDone ? <IconCheck /> : balloon.receivedAt ? <IconPrinter /> : <IconHourglassEmpty /> }
        </ThemeIcon>
      </Table.Td>
      <Table.Td>{ balloon.balloonid }</Table.Td>
      <Table.Td>{ new Date(+balloon.time).toLocaleTimeString() }</Table.Td>
      <Table.Td><Badge color={balloon.contestproblem.rgb} size="xl" radius="sm">{ balloon.problem }</Badge></Table.Td>
      <Table.Td>{ balloon.team }</Table.Td>
      <Table.Td>{ balloon.affiliation }</Table.Td>
      <Table.Td>{ balloon.location }</Table.Td>
      <Table.Td style={{ minWidth: 50 }}>{ balloon.awards }</Table.Td>
      <Table.Td>
        { (Object.values(balloon.total) as any[]).map((t) => (
          <Badge key={t.short_name} color={t.rgb} size="md" radius="sm">{ t.short_name }</Badge>
        )) }
      </Table.Td>
      <Table.Td style={{ minWidth: 50 }}>
        <LoadingOverlay visible={loading} zIndex={1000} overlayProps={{ radius: 'sm', blur: 2 }} />
        <Group justify="center" gap={5}>
          <Tooltip label="Reprint">
            <ActionIcon variant="transparent" color="yellow" aria-label='Reprint' onClick={
              () => actions(balloon.balloonid, 'reprint')
            }><IconRefresh /></ActionIcon>
          </Tooltip>
        </Group>
      </Table.Td>
    </Table.Tr>
  );
}

export function BalloonsTable({ balloons, refresh }) {
  return (
    <Table
      horizontalSpacing="md" verticalSpacing="xs" miw={700}
      striped highlightOnHover stickyHeader
    >
      <Table.Thead>
        <Table.Tr>
          <Table.Th></Table.Th>
          <Table.Th>#</Table.Th>
          <Table.Th>Time</Table.Th>
          <Table.Th>Solved</Table.Th>
          <Table.Th>Team</Table.Th>
          <Table.Th>Affiliation</Table.Th>
          <Table.Th>location</Table.Th>
          <Table.Th>Awards</Table.Th>
          <Table.Th>Total</Table.Th>
          <Table.Th>Actions</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>{ balloons.map((balloon) => <BalloonRow key={balloon._id} balloon={balloon} refresh={refresh} />) }</Table.Tbody>
    </Table>
  );
}
