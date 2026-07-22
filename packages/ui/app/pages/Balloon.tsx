import {
  Alert, Card, Center, Group, Pagination, Select, Skeleton, Stack, Text, TextInput, Title,
} from '@mantine/core';
import { IconAlertCircle, IconSearch } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import React from 'react';
import { BallonColorChecker } from '../components/BalloonsModal';
import { BalloonsTable } from '../components/BalloonsTable';
import { PageHeader } from '../components/PageHeader';
import { balloonQuery } from '../queries';

export default function Balloon() {
  const [search, setSearch] = React.useState('');
  const [status, setStatus] = React.useState('all');
  const [page, setPage] = React.useState(1);
  const query = useQuery({
    ...balloonQuery(),
    refetchInterval: 300000,
  });
  const filteredBalloons = React.useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (query.data?.balloons || []).filter((balloon) => {
      const balloonStatus = balloon.printDone ? 'done' : balloon.receivedAt ? 'sent' : 'new';
      const matchesStatus = status === 'all' || status === balloonStatus;
      const haystack = [
        balloon.balloonid, balloon.problem, balloon.team, balloon.affiliation, balloon.location,
      ].join(' ').toLowerCase();
      return matchesStatus && (!needle || haystack.includes(needle));
    });
  }, [query.data?.balloons, search, status]);
  const pageCount = Math.max(1, Math.ceil(filteredBalloons.length / 50));
  const currentPage = Math.min(page, pageCount);
  const visibleBalloons = filteredBalloons.slice((currentPage - 1) * 50, currentPage * 50);

  return (
    <>
      <PageHeader
        title="Balloons"
        description="Track solved problems and dispatch status."
        isFetching={query.isFetching && !query.isPending}
        updatedAt={query.dataUpdatedAt}
        actions={<BallonColorChecker />}
      />
      {query.isError && !query.data && (
        <Alert color="red" mb="md" title="Unable to load balloon data" icon={<IconAlertCircle />}>
          Check the server connection and try again.
        </Alert>
      )}
      {query.isError && query.data && (
        <Alert color="yellow" mb="md" title="Refresh failed" icon={<IconAlertCircle />}>
          Showing the most recent balloon data.
        </Alert>
      )}
      {(!query.isError || query.data) && <Card padding="md" radius="md" withBorder>
        <Group justify="space-between" align="center" mb="md" wrap="wrap">
          <Title order={3} size="h4">Balloon tasks</Title>
          <Group gap="xs" wrap="wrap">
            <TextInput
              w={{ base: '100%', xs: 'auto' }}
              aria-label="Search balloon deliveries"
              placeholder="Search deliveries"
              leftSection={<IconSearch size={16} />}
              value={search}
              onChange={(event) => {
                setSearch(event.currentTarget.value);
                setPage(1);
              }}
            />
            <Select
              w={{ base: '100%', xs: 'auto' }}
              aria-label="Filter balloon deliveries by status"
              value={status}
              onChange={(value) => {
                setStatus(value || 'all');
                setPage(1);
              }}
              data={[
                { value: 'all', label: 'All statuses' },
                { value: 'new', label: 'New' },
                { value: 'sent', label: 'Sent' },
                { value: 'done', label: 'Done' },
              ]}
              allowDeselect={false}
            />
          </Group>
        </Group>
        {query.isPending ? (
          <Stack gap="xs">
            <Skeleton h={36} />
            <Skeleton h={44} />
            <Skeleton h={44} />
          </Stack>
        ) : (!filteredBalloons.length ? (
          <Center py="xl">
            <Text c="dimmed">
              {query.data?.balloons?.length ? 'No deliveries match the filters' : 'No balloon deliveries'}
            </Text>
          </Center>
        ) : (
          <Stack gap="md">
            <BalloonsTable
              balloons={visibleBalloons}
              refresh={query.refetch}
            />
            {pageCount > 1 && (
              <Group justify="space-between" wrap="wrap">
                <Text size="xs" c="dimmed">{filteredBalloons.length} deliveries, 50 per page</Text>
                <Pagination value={currentPage} total={pageCount} onChange={setPage} size="sm" />
              </Group>
            )}
          </Stack>
        ))}
      </Card>}
    </>
  );
}
