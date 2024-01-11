import React from 'react';
import {
  Button,
  Card, Center, Group, LoadingOverlay, Tabs, Text, Title,
} from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { MonitorBatchModal } from '../components/MonitorBatchModel';
import { MonitorCards, MonitorTable } from '../components/MonitorDisplay';
import { MonitorInfo } from '../components/MonitorInfo';

export default function Monitor() {
  const [activeTab, setActiveTab] = React.useState('all');
  const [useTableMode, setUseTableMode] = React.useState(false);
  const [detailM, setDetailM] = React.useState(null);
  const [infoTab, setInfoTab] = React.useState('info');

  const query = useQuery({
    queryKey: ['monitor'],
    queryFn: () => fetch('/monitor').then((res) => res.json()),
    refetchInterval: 30000,
  });

  const load = query.isLoading || query.isFetching || query.isRefetching;

  const openMonitorInfo = (monitor, tab) => {
    setDetailM(monitor);
    setInfoTab(tab);
  };

  return (
    <>
      { detailM ? (
        <MonitorInfo monitor={detailM} refresh={query.refetch} back={() => setDetailM(null)} tab={infoTab} />
      ) : (
        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <LoadingOverlay visible={load} zIndex={1000} />
          <Group justify="space-between" mb="xs">
            <Title order={3}>Computer Status</Title>
            <Group>
              {
                activeTab !== 'all' && (
                  <Button
                    variant="outline"
                    color="gray"
                    onClick={() => setUseTableMode(!useTableMode)}
                  >
                    { useTableMode ? 'Cards View' : 'Table View' }
                  </Button>
                )
              }
              <MonitorBatchModal refresh={query.refetch} />
            </Group>
          </Group>
          <Tabs value={activeTab} onChange={setActiveTab}>
            <Tabs.List>
              <Tabs.Tab value="all">All</Tabs.Tab>
              { Object.keys(query.data?.groups || {}).map((group) => (
                <Tabs.Tab key={group} value={group}>{group}</Tabs.Tab>
              ))}
            </Tabs.List>

            <Tabs.Panel value="all">
              { !load && (!Object.values(query.data?.monitors || {}).length ? (
                <Center mt="md">
                  <Text c="dimmed">No monitors found</Text>
                </Center>
              ) : (<MonitorTable monitors={Object.values(query.data?.monitors || {})} openMonitorInfo={openMonitorInfo} />))}
            </Tabs.Panel>

            { Object.keys(query.data?.groups || {}).map((group) => (
              <Tabs.Panel key={group} value={group}>
                { !load && (!query.data?.groups[group].length ? (
                  <Center mt="md">
                    <Text c="dimmed">No monitors found</Text>
                  </Center>
                ) : (useTableMode ? (
                  <MonitorTable monitors={(query.data?.groups[group] || []).map((m) => query.data?.monitors[m])} openMonitorInfo={openMonitorInfo} />
                ) : (
                  <MonitorCards monitors={(query.data?.groups[group] || []).map((m) => query.data?.monitors[m])} openMonitorInfo={openMonitorInfo} />
                )))}
              </Tabs.Panel>
            ))}
          </Tabs>
        </Card>
      )
      }
    </>
  );
}
