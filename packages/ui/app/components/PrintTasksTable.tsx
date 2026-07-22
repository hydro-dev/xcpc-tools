import {
  ActionIcon, Badge, Group, LoadingOverlay, Stack, Table, Text,
  ThemeIcon,
  Tooltip,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import {
  IconCheck, IconEye, IconHourglassEmpty, IconPrinter, IconRefresh, IconX,
} from '@tabler/icons-react';
import React from 'react';

interface PrintTaskRowProps {
  colorCode: boolean;
  task: any;
  refresh: () => unknown;
}

const PrintTaskRow = React.memo(({ colorCode, task, refresh }: PrintTaskRowProps) => {
  const [loading, setLoading] = React.useState(false);
  const printGroup = task.group || task.matchedGroup;
  const showPrintGroup = task.printer && printGroup && String(printGroup).toUpperCase() !== 'ALL';

  const codeActions = async (_id, operation) => {
    setLoading(true);
    const post = () => fetch('/print', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ _id, operation, color: colorCode }),
    });
    try {
      const response = await post();
      if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
      if (operation === 'view') {
        const pdf = await response.blob();
        const previewUrl = URL.createObjectURL(pdf);
        modals.open({
          title: 'Code Preview',
          size: 'calc(100vw - 6rem)',
          onClose: () => URL.revokeObjectURL(previewUrl),
          children: (
            <object data={previewUrl} type="application/pdf" width="100%" height="85%">
              <embed src={previewUrl} type="application/pdf" />
            </object>
          ),
        });
      } else {
        const res = await response.json();
        if (res.error) {
          notifications.show({ title: 'Error', message: `${res.error.message}(${res.error.params})`, color: 'red' });
          return;
        }
        notifications.show({ title: 'Success', message: 'Code Updated', color: 'green' });
        refresh();
      }
    } catch (e) {
      console.error(e);
      notifications.show({ title: 'Error', message: 'Failed to update code', color: 'red' });
    } finally {
      setLoading(false);
    }
  };
  const confirmRemove = () => modals.openConfirmModal({
    title: 'Remove print task',
    children: <Text size="sm">This removes the print task from the queue and history.</Text>,
    labels: { confirm: 'Remove', cancel: 'Cancel' },
    confirmProps: { color: 'red' },
    onConfirm: () => codeActions(task._id, 'remove'),
  });
  const confirmReprint = () => modals.openConfirmModal({
    title: 'Reprint task',
    children: (
      <Text size="sm">
        {task.printer && !task.done
          ? 'This task is assigned and may already be printing. Resetting it can produce a duplicate print.'
          : `Print ${task.filename || task._id} again for ${task.team || 'this team'}?`}
      </Text>
    ),
    labels: { confirm: 'Reprint', cancel: 'Cancel' },
    onConfirm: () => codeActions(task._id, 'reprint'),
  });

  return (
    <Table.Tr key={task._id}>
      <Table.Td style={{ width: 40 }}>
        <ThemeIcon
          radius="xl"
          size="sm"
          color={task.done ? 'green' : task.printer ? 'blue' : 'gray'}
          role="img"
          aria-label={task.done ? 'Done' : task.printer ? 'Sent to printer' : 'Waiting'}
        >
          { task.done ? <IconCheck /> : task.printer ? <IconPrinter /> : <IconHourglassEmpty /> }
        </ThemeIcon>
      </Table.Td>
      <Table.Td>
        <Stack gap={1}>
          <Text size='sm'>{new Date(task.createAt).toLocaleString('zh')}</Text>
          <Tooltip label={task._id}>
            <Text size="xs" c="dimmed" ff="monospace">#{String(task._id).slice(-8).toUpperCase()}</Text>
          </Tooltip>
        </Stack>
      </Table.Td>
      <Table.Td>
        <Tooltip label={`[${task.location}]${task.team}`}>
          <Stack gap={1}>
            <Text lineClamp={1} size='sm'>{task.team}</Text>
            <Group gap="xs" wrap="nowrap">
              <Text size="xs" c="dimmed" ff="monospace">Seat {task.location || '-'}</Text>
              {showPrintGroup && <Badge size="xs" variant="light">{printGroup}</Badge>}
            </Group>
          </Stack>
        </Tooltip>
      </Table.Td>
      <Table.Td>{task.filename}({task.lang})</Table.Td>
      <Table.Td style={{ width: 200, minWidth: 200, maxWidth: 200 }}>
        <LoadingOverlay visible={loading} zIndex={1000} overlayProps={{ radius: 'sm', blur: 2 }} />
        <Group justify="center" gap="xs">
          <Tooltip label="View">
            <ActionIcon
              size="lg"
              variant="subtle"
              color="blue"
              aria-label='View'
              onClick={() => codeActions(task._id, 'view')}
            >
              <IconEye size={22} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Reprint">
            <ActionIcon size="lg" variant="subtle" color="yellow" aria-label='Reprint' onClick={confirmReprint}><IconRefresh size={22} /></ActionIcon>
          </Tooltip>
          <Tooltip label="Done">
            <ActionIcon size="lg" variant="subtle" color="green" aria-label='Done' onClick={
              () => codeActions(task._id, 'done')}><IconCheck size={22} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Remove">
            <ActionIcon size="lg" variant="subtle" color="red" aria-label='Remove' onClick={confirmRemove}><IconX size={22} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Table.Td>
    </Table.Tr>
  );
});

export function PrintTasksTable({ colorCode, codes, refresh }) {
  return (
    <Table.ScrollContainer minWidth={760}>
      <Table
        horizontalSpacing="md" verticalSpacing="xs"
        striped highlightOnHover stickyHeader
      >
        <Table.Thead>
          <Table.Tr>
            <Table.Th aria-label="Status" style={{ width: 40 }} />
            <Table.Th>Time</Table.Th>
            <Table.Th>Team</Table.Th>
            <Table.Th>Filename</Table.Th>
            <Table.Th style={{ width: 200, minWidth: 200, maxWidth: 200, textAlign: 'center' }}>Actions</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>{ codes.map((task) => <PrintTaskRow key={task._id} task={task} colorCode={colorCode} refresh={refresh} />) }</Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
