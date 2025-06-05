import {
  ActionIcon, Group, LoadingOverlay, Table, Text,
  ThemeIcon,
  Tooltip,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import {
  IconCheck, IconEye, IconHourglassEmpty, IconPrinter, IconRefresh, IconX,
} from '@tabler/icons-react';
import React from 'react';

function PrintTaskRow({ colorCode, task, refresh }) {
  const [loading, setLoading] = React.useState(false);

  const codeActions = async (_id, operation) => {
    setLoading(true);
    const post = () => fetch('/print', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ _id, operation, color: colorCode }),
    });
    if (operation === 'view') {
      const pdf = await (await post()).blob();
      modals.open({
        title: 'Code Preview',
        size: 'calc(100vw - 6rem)',
        children: (
          <object data={URL.createObjectURL(pdf)} type="application/pdf" width="100%" height="85%">
            <embed src={URL.createObjectURL(pdf)} type="application/pdf" />
          </object>
        ),
      });
    } else {
      try {
        const res = await (await post()).json();
        if (res.error) {
          notifications.show({ title: 'Error', message: `${res.error.message}(${res.error.params})`, color: 'red' });
          return;
        }
        notifications.show({ title: 'Success', message: 'Code Updated', color: 'green' });
      } catch (e) {
        console.error(e);
        notifications.show({ title: 'Error', message: 'Failed to update code', color: 'red' });
      }
      refresh();
    }
    setLoading(false);
  };

  return (
    <Table.Tr key={task._id}>
      <Table.Td>
        <ThemeIcon radius="xl" size="sm" color={task.done ? 'green' : task.printer ? 'blue' : 'gray'}>
          { task.done ? <IconCheck /> : task.printer ? <IconPrinter /> : <IconHourglassEmpty /> }
        </ThemeIcon>
      </Table.Td>
      <Table.Td>
        <Tooltip label={task._id}>
          <Text size='sm'>{task._id.substring(0, 6).toUpperCase()}</Text>
        </Tooltip>
      </Table.Td>
      <Table.Td>
        <Tooltip label={`[${task.location}]${task.team}`}>
          <Text lineClamp={1} size='sm'>[{task.location}]{task.team}</Text>
        </Tooltip>
      </Table.Td>
      <Table.Td>{task.filename}({task.lang})</Table.Td>
      <Table.Td style={{ minWidth: 200 }}>
        <LoadingOverlay visible={loading} zIndex={1000} overlayProps={{ radius: 'sm', blur: 2 }} />
        <Group justify="center" gap={5}>
          <Tooltip label="View">
            <ActionIcon variant="transparent" color="blue" aria-label='View' onClick={() => codeActions(task._id, 'view')}><IconEye /></ActionIcon>
          </Tooltip>
          <Tooltip label="Reprint">
            <ActionIcon variant="transparent" color="yellow" aria-label='Reprint' onClick={
              () => codeActions(task._id, 'reprint')
            }><IconRefresh /></ActionIcon>
          </Tooltip>
          <Tooltip label="Done">
            <ActionIcon variant="transparent" color="green" aria-label='Done' onClick={
              () => codeActions(task._id, 'done')}><IconCheck />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Remove">
            <ActionIcon variant="transparent" color="red" aria-label='Remove' onClick={
              () => codeActions(task._id, 'remove')}><IconX />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Table.Td>
    </Table.Tr>
  );
}

export function PrintTasksTable({ colorCode, codes, refresh }) {
  return (
    <Table
      horizontalSpacing="md" verticalSpacing="xs" miw={700}
      striped highlightOnHover stickyHeader
    >
      <Table.Thead>
        <Table.Tr>
          <Table.Th></Table.Th>
          <Table.Th>#</Table.Th>
          <Table.Th>Team</Table.Th>
          <Table.Th>Filename</Table.Th>
          <Table.Th>Actions</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>{ codes.map((task) => <PrintTaskRow key={task._id} task={task} colorCode={colorCode} refresh={refresh} />) }</Table.Tbody>
    </Table>
  );
}
