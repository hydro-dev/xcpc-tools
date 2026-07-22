import {
  Alert, Button, Card, Center, Group, MultiSelect, SegmentedControl, Select,
  Skeleton, Stack, Tabs, Text, Textarea, TextInput,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { IconAlertCircle, IconSearch } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import React from 'react';
import * as builtinCommands from '../commands';
import { CommandHistoryTable } from '../components/CommandHistoryTable';
import { PageHeader } from '../components/PageHeader';
import { commandsQuery } from '../queries';

export default function Commands() {
  const [command, setCommand] = React.useState('');
  const [target, setTarget] = React.useState<string[]>([]);
  const [targetMode, setTargetMode] = React.useState('all');
  const [activeTab, setActiveTab] = React.useState('history');
  const [submitting, setSubmitting] = React.useState(false);
  const [historySearch, setHistorySearch] = React.useState('');
  const [historyStatus, setHistoryStatus] = React.useState('all');

  const query = useQuery({
    ...commandsQuery(),
    refetchInterval: 10000,
  });

  const operation = async (op: string, withCommand = false) => {
    setSubmitting(true);
    try {
      const response = await fetch('/commands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: op,
          command: withCommand ? command : undefined,
          ...(withCommand && targetMode === 'all' ? { broadcast: true } : { target }),
        }),
      });
      if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
      const res = await response.json();
      if (res.error) {
        notifications.show({ title: 'Error', message: `${res.error.message}(${res.error.params})`, color: 'red' });
        return;
      }
      notifications.show({ title: 'Success', message: 'Commands Submitted', color: 'green' });
      if (withCommand && command) {
        setCommand('');
        setTarget([]);
      }
      query.refetch();
      setActiveTab('history');
    } catch (e) {
      console.error(e);
      notifications.show({ title: 'Error', message: 'Failed to submit Commands', color: 'red' });
    } finally {
      setSubmitting(false);
    }
  };
  const targetCount = target.length;
  const broadcast = targetMode === 'all';
  const v1OnlyCount = Number(query.data?.v1OnlyCount || 0);
  const targetOptions = React.useMemo(() => (query.data?.targets || []).map((machine) => ({
    value: machine.mac,
    label: `${machine.name || machine.hostname || machine.mac} · ${machine.mac}${machine.connected ? '' : ' (offline)'}`,
  })), [query.data?.targets]);
  const allTargetCount = query.data?.targets?.length || 0;
  const connectedTargetCount = React.useMemo(
    () => (query.data?.targets || []).filter((machine) => machine.connected).length,
    [query.data?.targets],
  );
  const offlineTargetCount = allTargetCount - connectedTargetCount;
  const filteredCommands = React.useMemo(() => {
    const needle = historySearch.trim().toLowerCase();
    return (query.data?.commands || []).filter((item) => {
      const itemStatus = item.status.total === 0 ? 'no-target' : item.status.pending > 0 ? 'pending' : 'completed';
      const matchesStatus = historyStatus === 'all' || historyStatus === itemStatus;
      const haystack = [item._id, item.command, ...(item.targetInfo || []).map((targetInfo) => (
        targetInfo.name || targetInfo.hostname || targetInfo.mac
      ))].join(' ').toLowerCase();
      return matchesStatus && (!needle || haystack.includes(needle));
    });
  }, [historySearch, historyStatus, query.data?.commands]);
  const confirmCommand = () => {
    modals.openConfirmModal({
      title: broadcast ? 'Send command to all v2 computers' : 'Send command',
      children: (
        <Stack gap="xs">
          <Text size="sm">
            {broadcast
              ? `This command will be sent to all ${allTargetCount} v2 computers. ${connectedTargetCount} online computers will receive it immediately${offlineTargetCount ? `; ${offlineTargetCount} offline computers will receive it after reconnecting` : ''}.`
              : `This command will be sent to ${targetCount} selected target${targetCount === 1 ? '' : 's'}.`}
          </Text>
          {broadcast && v1OnlyCount > 0 && (
            <Alert color="yellow" title={`${v1OnlyCount} v1 computer${v1OnlyCount === 1 ? '' : 's'} will be skipped`}>
              These computers only report through the v1 HTTP endpoint and cannot receive WebSocket commands.
            </Alert>
          )}
          <Text size="xs" c="dimmed" ff="monospace" lineClamp={4}>{command}</Text>
        </Stack>
      ),
      labels: { confirm: broadcast ? 'Send to all' : 'Send command', cancel: 'Cancel' },
      confirmProps: { color: broadcast ? 'red' : 'blue' },
      onConfirm: () => operation('command', true),
    });
  };

  return (
    <>
      <PageHeader
        title="Commands"
        description="Send controlled maintenance commands and inspect execution results."
        isFetching={query.isFetching && !query.isPending}
        updatedAt={query.dataUpdatedAt}
      />
      {query.isError && !query.data && (
        <Alert color="red" mb="md" title="Unable to load command history" icon={<IconAlertCircle />}>
          Check the server connection and try again.
        </Alert>
      )}
      {query.isError && query.data && (
        <Alert color="yellow" mb="md" title="Refresh failed" icon={<IconAlertCircle />}>
          Showing the most recent command history.
        </Alert>
      )}
      {(!query.isError || query.data) && <Card padding="md" radius="md" withBorder>
        <Tabs value={activeTab} onChange={(value) => setActiveTab(value!)}>
          <Tabs.List>
            <Tabs.Tab value="history">
              History
              {query.data?.commands?.length > 0 && ` (${query.data.commands.length})`}
            </Tabs.Tab>
            <Tabs.Tab value="send">Send Command</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="send" pt="md">
            <Group gap="xs" mt="md">
              <Text size="sm" fw={500}>Built-in commands</Text>
              {Object.entries(builtinCommands).map(([name, content]) => (
                <Button key={name} size="xs" variant="light" onClick={() => setCommand(content)}>
                  {name.replace(/([A-Z])/g, ' $1').trim().replace(/^\w/, (character) => character.toUpperCase())}
                </Button>
              ))}
            </Group>
            <Textarea
              label="Command"
              my="md"
              autosize
              minRows={10}
              cols={100}
              styles={{ input: { fontFamily: 'monospace' } }}
              value={command}
              onChange={(ev) => setCommand(ev.target.value)}
            />
            <SegmentedControl
              value={targetMode}
              onChange={setTargetMode}
              data={[
                { value: 'selected', label: 'Selected machines' },
                { value: 'all', label: 'All v2 machines' },
              ]}
            />
            {targetMode === 'selected' ? (
              <MultiSelect
                label="Machines"
                placeholder="Select computers"
                my="md"
                data={targetOptions}
                value={target}
                onChange={setTarget}
                searchable
                clearable
                hidePickedOptions
                description={`${targetCount} selected`}
              />
            ) : (
              <Alert my="md" color="red" title={`All ${allTargetCount} v2 machines`}>
                {connectedTargetCount} online machines will receive the command immediately.
                {offlineTargetCount > 0 && ` ${offlineTargetCount} offline machines will receive it after reconnecting.`}
              </Alert>
            )}
            {v1OnlyCount > 0 && (
              <Alert mb="md" color="yellow" title={`${v1OnlyCount} recent v1 computer${v1OnlyCount === 1 ? '' : 's'} cannot receive commands`}>
                Upgrade these computers to the v2 WebSocket probe before sending commands to them.
              </Alert>
            )}
            <Group justify="center" my="md">
              <Button
                size="sm"
                loading={submitting}
                disabled={!command.trim() || (broadcast ? !allTargetCount : !targetCount)}
                onClick={confirmCommand}
              >
                Send command
              </Button>
            </Group>
          </Tabs.Panel>

          <Tabs.Panel value="history" pt="md">
            <Group justify="flex-end" align="flex-end" mb="md" wrap="wrap">
              <TextInput
                w={{ base: '100%', xs: 'auto' }}
                aria-label="Search command history"
                placeholder="Search history"
                leftSection={<IconSearch size={16} />}
                value={historySearch}
                onChange={(event) => setHistorySearch(event.currentTarget.value)}
              />
              <Select
                w={{ base: '100%', xs: 'auto' }}
                aria-label="Filter command history by status"
                value={historyStatus}
                onChange={(value) => setHistoryStatus(value || 'all')}
                data={[
                  { value: 'all', label: 'All statuses' },
                  { value: 'pending', label: 'Pending' },
                  { value: 'completed', label: 'Completed' },
                  { value: 'no-target', label: 'No target' },
                ]}
                allowDeselect={false}
              />
            </Group>
            {query.isPending ? (
              <Stack gap="xs">
                <Skeleton h={40} />
                <Skeleton h={48} />
                <Skeleton h={48} />
              </Stack>
            ) : !filteredCommands.length ? (
              <Center py="xl">
                <Text c="dimmed">
                  {query.data?.commands?.length ? 'No commands match the filters' : 'No command history'}
                </Text>
              </Center>
            ) : (
              <CommandHistoryTable commands={filteredCommands} />
            )}
          </Tabs.Panel>
        </Tabs>
      </Card>}
    </>
  );
}
