import React from 'react';
import {
  Card, Center, Grid, Group, LoadingOverlay, Text, Title,
} from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { PrintClientAdd, PrintTaskAdd } from '../components/PrintAdd';
import { PrintClientInfo } from '../components/PrintClientInfo';
import { PrintTasksTable } from '../components/PrintTasksTable';

export default function Print() {
  const query = useQuery({
    queryKey: ['tasks'],
    queryFn: () => fetch('/print').then((res) => res.json()),
    refetchInterval: 30000,
  });

  const load = query.isLoading || query.isFetching || query.isRefetching;

  return (
    <>
      <Grid>
        <Grid.Col span={9}>
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <LoadingOverlay visible={load} zIndex={1000} />
            <Group justify="space-between" mb="xs">
              <Title order={3}>Print Tasks</Title>
              <PrintTaskAdd refresh={query.refetch} />
            </Group>
            { !load && (!(query.data?.codes || []).length ? (
              <Center mt="md">
                <Text c="dimmed">No tasks found</Text>
              </Center>
            ) : (<PrintTasksTable codes={query.data?.codes || []} refresh={query.refetch} />))}
          </Card>
        </Grid.Col>
        <Grid.Col span={3}>
          <LoadingOverlay visible={load} zIndex={1000} />
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Group justify="space-between" mb="xs">
              <Title order={3}>Print Clients</Title>
              <PrintClientAdd refresh={query.refetch} />
            </Group>
            { !load && (!(query.data?.clients || []).length ? (
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
