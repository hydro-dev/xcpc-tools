import React from 'react';
import {
  Card, Center, Group, Tabs, Text,
  Title,
} from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { MonitorCards, MonitorTable } from '../components/MonitorDisplay';

export default function Monitor() {
  const [activeTab, setActiveTab] = React.useState('all');
  const [useTableMode, setUseTableMode] = React.useState(false);

  const query = useQuery({
    queryKey: ['tasks'],
    queryFn: () => fetch('/monitor').then((res) => res.json()),
    refetchInterval: 30000,
  });

  return (
    <Card shadow="sm" padding="lg" radius="md" withBorder>
      <Group justify="space-between" mb="xs">
        <Title order={3}>Computer Status</Title>
        {
          activeTab !== 'all' && (
            <Text
              onClick={() => setUseTableMode((c) => !c)}
              style={{ cursor: 'pointer' }}
              variant="link"
            >
              { useTableMode ? 'Show as cards' : 'Show as table' }
            </Text>
          )
        }
      </Group>
      <Tabs value={activeTab} onChange={setActiveTab}>
        <Tabs.List>
          <Tabs.Tab value="all">All</Tabs.Tab>
          { Object.keys(query.data?.groups || {}).map((group) => (
            <Tabs.Tab key={group} value={group}>{group}</Tabs.Tab>
          ))}
        </Tabs.List>

        <Tabs.Panel value="all">
          <MonitorTable monitors={Object.values(query.data?.monitors || {})} refresh={query.refetch} />
          { !query.isLoading && !Object.values(query.data?.monitors || {}).length && (
            <Center mt="md">
              <Text c="dimmed">No monitors found</Text>
            </Center>
          )}
        </Tabs.Panel>

        { Object.keys(query.data?.groups || {}).map((group) => (
          <Tabs.Panel key={group} value={group}>
            { useTableMode ? (
              <MonitorTable monitors={query.data?.groups[group].map((m) => query.data?.monitors[m]) || []} refresh={query.refetch} />
            ) : (
              <MonitorCards monitors={query.data?.groups[group].map((m) => query.data?.monitors[m]) || []} refresh={query.refetch} />
            )}
            { !query.isLoading && !query.data?.groups[group].length && (
              <Center mt="md">
                <Text c="dimmed">No monitors found</Text>
              </Center>
            )}
          </Tabs.Panel>
        ))}
      </Tabs>
    </Card>
  );
}
