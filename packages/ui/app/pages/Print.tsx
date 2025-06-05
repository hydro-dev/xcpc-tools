import {
  Card, Center, Grid, Group, LoadingOverlay, Switch, Text, Title,
} from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import React from 'react';
import { PrintClientAdd, PrintTaskAdd } from '../components/PrintAdd';
import { PrintClientInfo } from '../components/PrintClientInfo';
import { PrintTasksTable } from '../components/PrintTasksTable';

export default function Print() {
  const query = useQuery({
    queryKey: ['tasks'],
    queryFn: () => fetch('/print').then((res) => res.json()),
    refetchInterval: 15000,
  });

  const load = query.isLoading || query.isFetching || query.isRefetching;

  const [colorCode, setColorCode] = React.useState(false);

  return (
    <>
      <Grid>
        <Grid.Col span={9}>
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <LoadingOverlay visible={load} zIndex={1000} />
            <Group justify="space-between" mb="xs">
              <Title order={3}>Print Tasks</Title>
              <Group mb="xs">
                Color Code
                <Switch checked={colorCode} onChange={(ev) => setColorCode(ev.currentTarget.checked)} />
                <PrintTaskAdd refresh={query.refetch} />
              </Group>
            </Group>
            {(!query.isLoading && !query.isFetching && (!(query.data?.codes || []).length) ? (
              <Center mt="md">
                <Text c="dimmed">No tasks found</Text>
              </Center>
            ) : (<PrintTasksTable colorCode={colorCode} codes={query.data?.codes || []} refresh={query.refetch} />))}
          </Card>
        </Grid.Col>
        <Grid.Col span={3}>
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <LoadingOverlay visible={load} zIndex={1000} />
            <Group justify="space-between" mb="xs">
              <Title order={3}>Print Clients</Title>
              <PrintClientAdd refresh={query.refetch} />
            </Group>
            {(!query.isLoading && !query.isFetching && (!(query.data?.clients || []).length) ? (
              <Center mt="md">
                <Text c="dimmed">No clients found</Text>
              </Center>
            ) : (<PrintClientInfo clients={query.data?.clients || []} refresh={query.refetch} />))}
          </Card>
        </Grid.Col>
      </Grid>
    </>
  );
}
