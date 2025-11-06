import {
  Button, Card, Center, Divider, Group, LoadingOverlay, Tabs, Text, Textarea, TextInput, Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useQuery } from '@tanstack/react-query';
import React from 'react';
import { CommandHistoryTable } from '../components/CommandHistoryTable';
import { useCommandsWs } from '../hooks/useCommandsWs';

export default function Commands() {
  const [command, setCommand] = React.useState('');
  const [target, setTarget] = React.useState('');
  const [activeTab, setActiveTab] = React.useState('history');

  const { connected } = useCommandsWs((msg) => {
    if (msg.type === 'command_status' || msg.type === 'command_output') {
      query.refetch();
    }
  });

  const query = useQuery({
    queryKey: ['commands'],
    queryFn: () => fetch('/commands').then((res) => res.json()),
    refetchInterval: connected ? 600000 : 10000, // ws 断开，进行服务降级
  });

  const operation = async (op: string, withCommand = false) => {
    try {
      let targetArray: string[] | undefined;
      if (withCommand && target.trim()) {
        targetArray = target.split(/[,\n]/).map((t) => t.trim()).filter((t) => t.length > 0);
      }
      const res = await (await fetch('/commands', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: op,
          command: withCommand ? command : undefined,
          ...(targetArray?.length && { target: targetArray }),
        }),
      })).json();
      if (res.error) {
        notifications.show({ title: 'Error', message: `${res.error.message}(${res.error.params})`, color: 'red' });
        return;
      }
      notifications.show({ title: 'Success', message: 'Commands Submitted', color: 'green' });
      if (withCommand && command) {
        setCommand('');
        setTarget('');
      }
      query.refetch();
      setActiveTab('history');
    } catch (e) {
      console.error(e);
      notifications.show({ title: 'Error', message: 'Failed to submit Commands', color: 'red' });
    }
  };

  const load = query.isLoading || query.isFetching || query.isRefetching;

  return (
    <Card shadow="sm" padding="lg" radius="md" withBorder>
      <LoadingOverlay visible={load} zIndex={1000} />
      <Title order={3}>Commands</Title>
      <Tabs value={activeTab} onChange={(value) => setActiveTab(value!)} mt="md">
        <Tabs.List>
          <Tabs.Tab value="history">
            History
            {query.data?.commands?.length > 0 && ` (${query.data.commands.length})`}
          </Tabs.Tab>
          <Tabs.Tab value="send">Send Command</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="send" pt="md">
          <Textarea
            label="Command"
            my="md"
            rows={10}
            cols={100}
            style={{ fontFamily: 'monospace' }}
            value={command}
            onChange={(ev) => setCommand(ev.target.value)}
          />
          <TextInput
            label="Target (Optional)"
            placeholder="MAC addresses, separated by comma or newline. Leave empty to execute on all online hosts."
            my="md"
            value={target}
            onChange={(ev) => setTarget(ev.target.value)}
          />
          <Group justify="center" my="md">
            <Button onClick={() => operation('command', true)}>Send</Button>
          </Group>
          <Divider my="md" />
          <Title order={4}>Quick Commands</Title>
          <Group my="md" justify="space-start">
            <Button onClick={() => operation('reboot')}>Reboot All</Button>
            <Button onClick={() => operation('set_hostname')}>Update Hostname</Button>
            <Button onClick={() => operation('show_ids')}>Show IDS</Button>
          </Group>
        </Tabs.Panel>

        <Tabs.Panel value="history" pt="md">
          {query.isLoading || query.isFetching ? (
            <Center py="xl">
              <Text c="dimmed">Loading...</Text>
            </Center>
          ) : !query.data?.commands?.length ? (
            <Center py="xl">
              <Text c="dimmed">No command history</Text>
            </Center>
          ) : (
            <CommandHistoryTable commands={query.data.commands || []} />
          )}
        </Tabs.Panel>
      </Tabs>
    </Card>
  );
}
