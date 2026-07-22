import {
  Accordion, ActionIcon, Badge, Code, Group, Table, Text, Tooltip,
} from '@mantine/core';
import { useClipboard } from '@mantine/hooks';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import {
  IconCheck, IconEye, IconHourglassEmpty, IconTrash,
} from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import React from 'react';

function ResultGroup({
  status = 'pending', targets, result, itemKey, itemValue,
}) {
  const hostNames = targets.map((t) => t.name || t.hostname || t.mac).sort();
  const displayNames = hostNames.length > 10
    ? `${hostNames.slice(0, 10).join(', ')}, ... (+${hostNames.length - 10} more)`
    : hostNames.join(', ');

  return (
    <Accordion.Item key={itemKey} value={itemValue}>
      <Accordion.Control>
        <Group justify="space-between">
          <Text size="sm" fw={500}>
            {status === 'pending'
              ? `${targets.length} host${targets.length > 1 ? 's' : ''} pending: ${displayNames}`
              : `${targets.length} host${targets.length > 1 ? 's' : ''}: ${displayNames}`}
          </Text>
          <Badge color={status === 'pending' ? 'yellow' : 'green'} size="sm">
            {status === 'pending' ? 'Pending' : 'Completed'}
          </Badge>
        </Group>
      </Accordion.Control>
      <Accordion.Panel>
        <Text size="xs" c="dimmed" mb="xs">
          Hosts: {hostNames.join(', ')}
        </Text>
        {result && (
          <Code block style={{ maxHeight: '300px', overflow: 'auto', whiteSpace: 'pre-wrap' }}>
            {result}
          </Code>
        )}
        {!result && (
          <Text size="sm" c="dimmed">Waiting for execution result...</Text>
        )}
      </Accordion.Panel>
    </Accordion.Item>
  );
}

const CommandRow = React.memo(({ command }: { command: any }) => {
  const clipboard = useClipboard();
  const queryClient = useQueryClient();
  const remove = React.useCallback(() => {
    modals.openConfirmModal({
      title: 'Remove command history',
      children: <Text size="sm">This removes the command and its execution results from history.</Text>,
      labels: { confirm: 'Remove', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: async () => {
        try {
          const response = await fetch('/commands', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              operation: 'remove',
              command: command._id,
            }),
          });
          if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
          const result = await response.json();
          if (result.error) throw new Error(result.error.message || 'Server rejected the request');
          await queryClient.invalidateQueries({ queryKey: ['commands'] });
          notifications.show({ title: 'Success', message: 'Command removed', color: 'green' });
        } catch (error) {
          console.error(error);
          notifications.show({ title: 'Error', message: 'Failed to remove command', color: 'red' });
        }
      },
    });
  }, [command._id, queryClient]);
  const getStatusBadge = () => {
    const { status } = command;
    if (status.total === 0) {
      return <Badge color="gray">No Target</Badge>;
    }
    if (status.pending > 0) {
      return <Badge color="yellow" leftSection={<IconHourglassEmpty size={14} />}>{status.completed}/{status.total}</Badge>;
    }
    return <Badge color="green" leftSection={<IconCheck size={14} />}>{status.completed}/{status.total}</Badge>;
  };

  return (
    <>
      <Table.Tr key={command._id}>
        <Table.Td style={{ maxWidth: 100 }}>
          <Tooltip label={command._id}>
            <Text size="sm" c="dimmed" truncate>
              {command._id.substring(0, 8)}
            </Text>
          </Tooltip>
        </Table.Td>
        <Table.Td style={{ maxWidth: 400 }}>
          <Group gap="xs" align="flex-start" wrap="nowrap">
            <button
              type="button"
              style={{
                margin: 0,
                padding: '4px 8px',
                border: 0,
                fontSize: '0.75rem',
                fontFamily: 'monospace',
                textAlign: 'left',
                maxWidth: '100%',
                maxHeight: '200px',
                overflow: 'hidden',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                backgroundColor: 'var(--mantine-color-gray-0)',
                borderRadius: '4px',
                cursor: 'pointer',
                flex: 1,
              }}
              onClick={() => {
                clipboard.copy(command.command);
                notifications.show({ title: 'Success', message: 'Command copied to clipboard!', color: 'green' });
              }}
              aria-label="Copy command"
            >
              {command.command}
            </button>
          </Group>
        </Table.Td>
        <Table.Td>
          {getStatusBadge()}
        </Table.Td>
        <Table.Td>
          <Group gap="xs">
            <Tooltip label="View Results">
              <ActionIcon
                variant="subtle"
                color="blue"
                aria-label="View execution results"
                onClick={() => {
                  const resultGroups = new Map<string, typeof command.targetInfo>();
                  const pendingTargets: typeof command.targetInfo = [];

                  command.targetInfo.forEach((target) => {
                    const result = command.executionResult[target.mac];
                    if (!result) {
                      pendingTargets.push(target);
                    } else {
                      const normalizedResult = result.trim();
                      if (!resultGroups.has(normalizedResult)) {
                        resultGroups.set(normalizedResult, []);
                      }
                      resultGroups.get(normalizedResult)!.push(target);
                    }
                  });

                  modals.open({
                    title: 'Execution Results',
                    size: 'xl',
                    children: (
                      <Accordion>
                        {Array.from(resultGroups.entries()).map(([result, targets], index) => (
                          <ResultGroup
                            key={`result-${index}`}
                            itemKey={`result-${index}`}
                            itemValue={`result-${index}`}
                            status="completed"
                            targets={targets}
                            result={result}
                          />
                        ))}
                        {pendingTargets.length > 0 && (
                          <ResultGroup
                            key="pending"
                            itemKey="pending"
                            itemValue="pending"
                            status="pending"
                            targets={pendingTargets}
                            result={null}
                          />
                        )}
                      </Accordion>
                    ),
                  });
                }}
              >
                <IconEye size={16} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Remove">
              <ActionIcon variant="subtle" color="red" aria-label="Remove command" onClick={remove}>
                <IconTrash size={16} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Table.Td>
      </Table.Tr>
    </>
  );
});

export function CommandHistoryTable({ commands }) {
  return (
    <Table.ScrollContainer minWidth={760}>
      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th style={{ width: 100 }}>ID</Table.Th>
            <Table.Th>Command</Table.Th>
            <Table.Th style={{ width: 120 }}>Status</Table.Th>
            <Table.Th style={{ width: 100 }}>Actions</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>{commands.map((command) => (
          <CommandRow key={command._id} command={command} />
        ))}</Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
