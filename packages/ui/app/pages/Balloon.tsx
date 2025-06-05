import {
  Card, Center, Group, LoadingOverlay, Text, Title,
} from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import React from 'react';
import { BallonColorChecker, BalloonsClient } from '../components/BalloonsModal';
import { BalloonsTable } from '../components/BalloonsTable';

export default function Print() {
  const query = useQuery({
    queryKey: ['balloons'],
    queryFn: () => fetch('/balloon').then((res) => res.json()),
    refetchInterval: 300000,
  });

  const load = query.isLoading || query.isFetching || query.isRefetching;

  return (
    <Card shadow="sm" padding="lg" radius="md" withBorder>
      <LoadingOverlay visible={load} zIndex={1000} />
      <Group justify="space-between" mb="xs">
        <Title order={3}>Balloons</Title>
        <Group>
          <BallonColorChecker />
          <BalloonsClient clients={query.data?.clients || []} refresh={query.refetch} />
        </Group>
      </Group>
      {(!query.isLoading && !query.isFetching && (!(query.data?.balloons || []).length) ? (
        <Center mt="md">
          <Text c="dimmed">No balloons found</Text>
        </Center>
      ) : (<BalloonsTable balloons={query.data?.balloons || []} refresh={query.refetch} />))}
    </Card>
  );
}
