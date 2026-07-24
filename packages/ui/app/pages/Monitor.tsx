import {
  Alert, Button, Card, Center, Group, Pagination, ScrollArea, SegmentedControl, Select, Skeleton, Stack, Tabs, Text, TextInput,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import {
  IconAlertCircle, IconSearch, IconTrash,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArenaView } from '../components/ArenaView';
import { MonitorBatchModal } from '../components/MonitorBatchModel';
import { MonitorTable } from '../components/MonitorDisplay';
import { MonitorInfo } from '../components/MonitorInfo';
import { PageHeader } from '../components/PageHeader';
import { monitorQuery } from '../queries';

const isArenaMode = (mode: string | null) => mode === 'signal' || mode === 'bssid' || mode === 'status';

export default function Monitor() {
  const [searchParams, setSearchParams] = useSearchParams();
  const legacyArenaMode = React.useRef(
    typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('mode'),
  );
  const routeHasArenaMode = isArenaMode(searchParams.get('mode')) || isArenaMode(legacyArenaMode.current);
  const viewParam = searchParams.get('view');
  const activeView = viewParam === 'arena' || (viewParam !== 'table' && routeHasArenaMode) ? 'arena' : 'table';
  const [activeTab, setActiveTab] = React.useState('all');
  const [detailId, setDetailId] = React.useState<string | null>(null);
  const [infoTab, setInfoTab] = React.useState('info');
  const [search, setSearch] = React.useState('');
  const [status, setStatus] = React.useState('all');
  const [page, setPage] = React.useState(1);
  const [showAll, setShowAll] = React.useState(false);
  const [currentTime, setCurrentTime] = React.useState(Date.now);

  const query = useQuery({
    ...monitorQuery(),
    refetchInterval: 30000,
  });

  const openMonitorInfo = React.useCallback((monitor, tab) => {
    setDetailId(monitor._id);
    setInfoTab(tab ?? 'info');
  }, []);
  React.useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  React.useEffect(() => {
    const legacyMode = legacyArenaMode.current;
    const moveLegacyMode = !isArenaMode(searchParams.get('mode')) && isArenaMode(legacyMode);
    const currentView = searchParams.get('view');
    const normalizedView = currentView === 'table' || currentView === 'arena'
      ? currentView
      : routeHasArenaMode ? 'arena' : 'table';
    if (!moveLegacyMode && currentView === normalizedView) return;
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('view', normalizedView);
    if (moveLegacyMode) {
      nextParams.set('mode', legacyMode!);
      const outer = new URL(window.location.href);
      outer.searchParams.delete('mode');
      const hashPath = window.location.hash.split('?')[0] || '#/monitor';
      window.history.replaceState(
        window.history.state,
        '',
        `${outer.pathname}${outer.search}${hashPath}?${nextParams.toString()}`,
      );
      legacyArenaMode.current = null;
    }
    setSearchParams(nextParams, { replace: true });
  }, [routeHasArenaMode, searchParams, setSearchParams]);
  const changeView = React.useCallback((view: string) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('view', view);
    if (view === 'arena') {
      if (!isArenaMode(nextParams.get('mode'))) nextParams.set('mode', 'signal');
    } else {
      nextParams.delete('mode');
    }
    setSearchParams(nextParams);
  }, [searchParams, setSearchParams]);

  const cleanAll = React.useCallback(async () => {
    try {
      const response = await fetch('/monitor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operation: 'clean_all' }),
      });
      if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
      const res = await response.json();
      if (res.error) {
        notifications.show({ title: 'Error', message: res.error.message, color: 'red' });
        return;
      }
      notifications.show({ title: 'Success', message: 'All monitors cleaned', color: 'green' });
      query.refetch();
    } catch (e) {
      console.error(e);
      notifications.show({ title: 'Error', message: 'Failed to clean all monitors', color: 'red' });
    }
  }, [query.refetch]);
  const confirmCleanAll = React.useCallback(() => {
    modals.openConfirmModal({
      title: 'Clean all computers',
      children: <Text size="sm">This removes every workstation currently shown in the monitor list.</Text>,
      labels: { confirm: 'Clean all', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: cleanAll,
    });
  }, [cleanAll]);

  const monitorsArray = React.useMemo<any[]>(
    () => Object.values(query.data?.monitors || {}) as any[],
    [query.data?.monitors],
  );
  const filteredMonitors = React.useMemo(() => {
    const needle = search.trim().toLowerCase();
    const onlineThreshold = currentTime - 120_000;
    return monitorsArray.filter((monitor) => {
      const online = monitor.updateAt && monitor.updateAt > onlineThreshold;
      const matchesStatus = status === 'all' || (status === 'online' ? online : !online);
      const haystack = [
        monitor.name, monitor.hostname, monitor.group, monitor.ip, monitor.mac,
      ].join(' ').toLowerCase();
      return matchesStatus && (!needle || haystack.includes(needle));
    });
  }, [currentTime, monitorsArray, search, status]);
  const filteredMonitorIds = React.useMemo(
    () => new Set(filteredMonitors.map((monitor) => monitor._id)),
    [filteredMonitors],
  );
  const groupedMonitors = React.useMemo(() => Object.fromEntries(
    Object.entries(query.data?.groups || {}).map(([group, monitorIds]: [string, any]) => [
      group,
      monitorIds.map((id) => query.data?.monitors[id]).filter((monitor) => monitor && filteredMonitorIds.has(monitor._id)),
    ]),
  ), [filteredMonitorIds, query.data?.groups, query.data?.monitors]);
  const activeMonitors = activeTab === 'all' ? filteredMonitors : groupedMonitors[activeTab] || [];
  const pageCount = Math.max(1, Math.ceil(activeMonitors.length / 50));
  const currentPage = Math.min(page, pageCount);
  const visibleMonitors = React.useMemo(
    () => showAll ? activeMonitors : activeMonitors.slice((currentPage - 1) * 50, currentPage * 50),
    [activeMonitors, currentPage, showAll],
  );
  const detailMonitor = React.useMemo(
    () => (detailId ? monitorsArray.find((monitor) => monitor._id === detailId) || null : null),
    [detailId, monitorsArray],
  );

  return (
    <>
      {detailMonitor && (
        <MonitorInfo
          monitor={detailMonitor}
          refresh={query.refetch}
          back={() => setDetailId(null)}
          tab={infoTab}
        />
      )}
      <div style={{
        display: detailMonitor ? 'none' : activeView === 'arena' ? 'flex' : undefined,
        flexDirection: activeView === 'arena' ? 'column' : undefined,
        height: activeView === 'arena'
          ? 'calc(100dvh - var(--app-shell-header-offset, 0rem) - var(--app-shell-padding) - var(--app-shell-padding))'
          : undefined,
        minHeight: activeView === 'arena' ? 0 : undefined,
      }}>
          <PageHeader
            title="Computers"
            description="Monitor contestant workstations, inspect streams, and run batch actions."
            isFetching={query.isFetching && !query.isPending}
            updatedAt={query.dataUpdatedAt}
            actions={(
              <Group gap="xs" wrap="wrap">
                <SegmentedControl
                  size="xs"
                  value={activeView}
                  onChange={changeView}
                  data={[
                    { value: 'table', label: 'Table view' },
                    { value: 'arena', label: 'Arena view' },
                  ]}
                />
                <MonitorBatchModal refresh={query.refetch} />
                <Button
                  size="xs"
                  variant="outline"
                  color="red"
                  leftSection={<IconTrash size={15} />}
                  onClick={confirmCleanAll}
                >
                  Clean all
                </Button>
              </Group>
            )}
          />
          {query.isError && !query.data && (
            <Alert color="red" mb="md" title="Unable to load computers" icon={<IconAlertCircle />}>
              Check the server connection and try again.
            </Alert>
          )}
          {query.isError && query.data && (
            <Alert color="yellow" mb="md" title="Refresh failed" icon={<IconAlertCircle />}>
              Showing the most recent workstation data.
            </Alert>
          )}
          {(!query.isError || query.data) && <Card
            padding="md"
            radius="md"
            withBorder
            style={activeView === 'arena'
              ? { display: 'flex', flex: 1, minHeight: 0, flexDirection: 'column' }
              : undefined}
          >
            {query.isPending ? (
              <Stack gap="xs">
                <Skeleton h={36} />
                <Skeleton h={48} />
                <Skeleton h={48} />
              </Stack>
            ) : activeView === 'arena' ? (
              <ArenaView monitors={monitorsArray} isLoading={query.isPending} openMonitorInfo={openMonitorInfo} />
            ) : (
              <Stack gap="md">
                <Tabs
                  value={activeTab}
                  onChange={(value) => {
                    setActiveTab(value!);
                    setPage(1);
                  }}
                >
                  <Group justify="space-between" align="center" gap="md" wrap="wrap">
                    <ScrollArea
                      type="auto"
                      scrollbarSize={6}
                      offsetScrollbars
                      style={{ flex: '1 1 320px', minWidth: 0 }}
                    >
                      <Tabs.List style={{ flexWrap: 'nowrap' }}>
                        <Tabs.Tab value="all">All({filteredMonitors.length})</Tabs.Tab>
                        {Object.entries(query.data?.groups || {}).map(([group]: [string, any]) => (
                          <Tabs.Tab key={group} value={group}>{group}({groupedMonitors[group]?.length || 0})</Tabs.Tab>
                        ))}
                      </Tabs.List>
                    </ScrollArea>
                    <Group gap="xs" wrap="nowrap" w={{ base: '100%', sm: 'auto' }}>
                      <TextInput
                        w={{ sm: 220 }}
                        style={{ flex: 1 }}
                        aria-label="Search computers"
                        placeholder="Search computers"
                        leftSection={<IconSearch size={16} />}
                        value={search}
                        onChange={(event) => {
                          setSearch(event.currentTarget.value);
                          setPage(1);
                        }}
                      />
                      <Select
                        w={130}
                        aria-label="Filter computers by status"
                        value={status}
                        onChange={(value) => {
                          setStatus(value || 'all');
                          setPage(1);
                        }}
                        data={[
                          { value: 'all', label: 'All statuses' },
                          { value: 'online', label: 'Online' },
                          { value: 'offline', label: 'Offline' },
                        ]}
                        allowDeselect={false}
                      />
                    </Group>
                  </Group>
                </Tabs>
                {!activeMonitors.length ? (
                  <Center mt="md">
                    <Text c="dimmed">{monitorsArray.length ? 'No computers match the filters' : 'No monitors found'}</Text>
                  </Center>
                ) : (
                  <Stack gap="md">
                    <MonitorTable monitors={visibleMonitors} openMonitorInfo={openMonitorInfo} />
                    {activeMonitors.length > 50 && (
                      <Group justify="space-between" wrap="wrap">
                        <Text size="xs" c="dimmed">
                          {showAll
                            ? `Showing all ${activeMonitors.length} computers`
                            : `${activeMonitors.length} computers, 50 per page`}
                        </Text>
                        <Group gap="xs" wrap="wrap">
                          {!showAll && (
                            <Pagination value={currentPage} total={pageCount} onChange={setPage} size="sm" />
                          )}
                          <Button size="xs" variant="default" onClick={() => setShowAll((value) => !value)}>
                            {showAll ? 'Show 50 per page' : 'Show all'}
                          </Button>
                        </Group>
                      </Group>
                    )}
                  </Stack>
                )}
              </Stack>
            )}
          </Card>}
      </div>
    </>
  );
}
