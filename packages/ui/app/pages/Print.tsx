import {
  Alert, Card, Center, Group, Pagination, Select, Skeleton,
  Stack, Switch, Text, TextInput, Title,
} from '@mantine/core';
import { IconAlertCircle, IconSearch } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import React from 'react';
import { PageHeader } from '../components/PageHeader';
import { PrintTaskAdd } from '../components/PrintAdd';
import { PrintTasksTable } from '../components/PrintTasksTable';
import { printQuery } from '../queries';

export default function Print() {
  const query = useQuery({
    ...printQuery(),
    refetchInterval: 15000,
  });

  const [colorCode, setColorCode] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [status, setStatus] = React.useState('all');
  const [locationGroup, setLocationGroup] = React.useState('all');
  const [page, setPage] = React.useState(1);
  const filteredCodes = React.useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (query.data?.codes || []).filter((task) => {
      const taskStatus = task.done ? 'done' : task.printer ? 'sent' : 'new';
      const matchesStatus = status === 'all' || status === taskStatus;
      const taskGroup = task.group || task.matchedGroup;
      const matchesGroup = locationGroup === 'all' || taskGroup === locationGroup;
      const haystack = [
        task._id, task.team, task.location, taskGroup, task.filename, task.lang,
        task.targetClient, task.targetClientName, task.targetPrinter,
      ].join(' ').toLowerCase();
      return matchesStatus && matchesGroup && (!needle || haystack.includes(needle));
    });
  }, [locationGroup, query.data?.codes, search, status]);
  const printerGroups = React.useMemo(() => Array.from(new Set(
    (query.data?.routing?.routes || []).map((route) => route.group).filter(Boolean),
  )).sort(), [query.data?.routing?.routes]);
  const locationGroups = React.useMemo(() => Array.from(new Set([
    ...(query.data?.codes || []).map((task) => task.group || task.matchedGroup),
    ...printerGroups,
  ].filter(Boolean))).sort(), [printerGroups, query.data?.codes]);
  const pageCount = Math.max(1, Math.ceil(filteredCodes.length / 50));
  const currentPage = Math.min(page, pageCount);
  const visibleCodes = filteredCodes.slice((currentPage - 1) * 50, currentPage * 50);
  return (
    <>
      <PageHeader
        title="Print"
        description="Review print jobs and the clients responsible for delivering them."
        isFetching={query.isFetching && !query.isPending}
        updatedAt={query.dataUpdatedAt}
        actions={(
          <Group gap="xs" wrap="wrap">
            <Switch
              size="xs"
              label="Color code"
              checked={colorCode}
              onChange={(ev) => setColorCode(ev.currentTarget.checked)}
            />
            <PrintTaskAdd refresh={query.refetch} groups={printerGroups} />
          </Group>
        )}
      />
      {query.isError && !query.data && (
        <Alert color="red" mb="md" title="Unable to load print data" icon={<IconAlertCircle />}>
          Check the server connection and try again.
        </Alert>
      )}
      {query.isError && query.data && (
        <Alert color="yellow" mb="md" title="Refresh failed" icon={<IconAlertCircle />}>
          Showing the most recent print data.
        </Alert>
      )}
      {(!query.isError || query.data) && (
        <Card padding="md" radius="md" withBorder>
          <Group justify="space-between" align="center" mb="md" wrap="wrap">
            <Title order={3} size="h4">Print tasks</Title>
            <Group gap="xs" wrap="wrap">
              <TextInput
                w={{ base: '100%', xs: 'auto' }}
                aria-label="Search print tasks"
                placeholder="Search tasks"
                leftSection={<IconSearch size={16} />}
                value={search}
                onChange={(event) => {
                  setSearch(event.currentTarget.value);
                  setPage(1);
                }}
              />
              <Select
                w={{ base: '100%', xs: 'auto' }}
                aria-label="Filter print tasks by status"
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
              <Select
                w={{ base: '100%', xs: 'auto' }}
                aria-label="Filter print tasks by location group"
                value={locationGroup}
                onChange={(value) => {
                  setLocationGroup(value || 'all');
                  setPage(1);
                }}
                data={[
                  { value: 'all', label: 'All groups' },
                  ...locationGroups.map((group) => ({ value: group, label: `Group ${group}` })),
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
          ) : (!filteredCodes.length ? (
            <Center mt="md">
              <Text c="dimmed">{query.data?.codes?.length ? 'No tasks match the filters' : 'No print tasks'}</Text>
            </Center>
          ) : (
            <Stack gap="md">
              <PrintTasksTable colorCode={colorCode} codes={visibleCodes} refresh={query.refetch} />
              {pageCount > 1 && (
                <Group justify="space-between" wrap="wrap">
                  <Text size="xs" c="dimmed">{filteredCodes.length} tasks, 50 per page</Text>
                  <Pagination value={currentPage} total={pageCount} onChange={setPage} size="sm" />
                </Group>
              )}
            </Stack>
          ))}
        </Card>
      )}
    </>
  );
}
