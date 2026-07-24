import {
  Alert, Badge, Box, Button, Grid, Group, Paper, Portal, ScrollArea, SimpleGrid,
  Skeleton, Stack, Text, ThemeIcon,
} from '@mantine/core';
import {
  IconAlertCircle, IconArrowsMaximize, IconArrowsMinimize, IconBalloon,
  IconDeviceHeartMonitor, IconPrinter, IconSchool, IconServer, IconUsersGroup,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import React from 'react';
import hydroLogo from '../../../machine-tools/frontend/public/hydro.png?inline';
import { ArenaView } from '../components/ArenaView';
import { DashboardClients } from '../components/DashboardClients';
import { PageHeader } from '../components/PageHeader';
import { metricsQuery, monitorQuery, overviewQuery } from '../queries';

interface MetricValue {
  labels: Record<string, string>;
  value: number;
}

interface Metric {
  name: string;
  values: MetricValue[];
}

interface SummaryMetric {
  label: string;
  value: number;
}

const totals = (metrics: Metric[] | undefined, name: string) => {
  const values = metrics?.find((metric) => metric.name === name)?.values || [];
  return values.reduce<Record<string, number>>((result, item) => {
    result[item.labels.status] = (result[item.labels.status] || 0) + item.value;
    return result;
  }, {});
};

const formatDate = (value?: number | null) => (
  value ? new Date(value).toLocaleString() : 'Not provided'
);

const contestPhase = (contest: any, now: number) => {
  if (contest.startAt && now < contest.startAt) return { label: 'Before contest', color: 'blue' };
  if (contest.endAt && now >= contest.endAt) return { label: 'Finished', color: 'gray' };
  if (contest.freezeAt && now >= contest.freezeAt) return { label: 'Frozen', color: 'orange' };
  return { label: 'Running', color: 'green' };
};

function ModuleSummary({
  title, description, color, Icon, metrics,
}: {
  title: string;
  description?: string;
  color: string;
  Icon: React.ElementType;
  metrics: SummaryMetric[];
}) {
  return (
    <Paper withBorder radius="md" style={{ overflow: 'hidden' }}>
      <Group gap={0} wrap="nowrap" align="stretch">
        <Box
          w={84}
          miw={84}
          bg={`var(--mantine-color-${color}-6)`}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon size={34} stroke={1.7} color="white" aria-hidden />
        </Box>
        <SimpleGrid
          cols={{ base: 2, sm: metrics.length + 1 }}
          spacing="md"
          p="md"
          style={{ flex: 1, minWidth: 0, alignItems: 'center' }}
        >
          <Stack gap={6}>
            <Text fw={700}>{title}</Text>
            {description && <Text size="xs" c="dimmed">{description}</Text>}
          </Stack>
          {metrics.map((metric) => (
            <Stack key={metric.label} gap={6}>
              <Text size="xs" c="dimmed">{metric.label}</Text>
              <Text size="xl" lh={1.1} fw={700} ff="monospace">{metric.value}</Text>
            </Stack>
          ))}
        </SimpleGrid>
      </Group>
    </Paper>
  );
}

export default function Dashboard() {
  const metrics = useQuery<Metric[]>({ ...metricsQuery(), refetchInterval: 30_000 });
  const overview = useQuery({ ...overviewQuery(), refetchInterval: 30_000 });
  const [arenaMode, setArenaMode] = React.useState(false);
  const monitor = useQuery({ ...monitorQuery(), enabled: arenaMode, refetchInterval: 30_000 });
  const monitors = React.useMemo<any[]>(
    () => Object.values(monitor.data?.monitors || {}) as any[],
    [monitor.data?.monitors],
  );

  React.useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) setArenaMode(false);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const enterArenaMode = React.useCallback(() => {
    setArenaMode(true);
    document.documentElement.requestFullscreen?.().catch(() => undefined);
  }, []);

  const exitArenaMode = React.useCallback(() => {
    setArenaMode(false);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
  }, []);
  const machines = totals(metrics.data, 'xcpc_machinecount');
  const print = totals(metrics.data, 'xcpc_printcount');
  const balloon = totals(metrics.data, 'xcpc_ballooncount');
  const phase = overview.data?.contest
    ? contestPhase(overview.data.contest, overview.data.serverTime || Date.now())
    : null;
  const moduleSummaries = [
    {
      title: 'Print', color: 'teal', Icon: IconPrinter,
      metrics: [
        { label: 'New', value: print.new || 0 },
        { label: 'Sent', value: print.sent || 0 },
        { label: 'Done', value: print.done || 0 },
      ],
    },
    {
      title: 'Balloon', color: 'orange', Icon: IconBalloon,
      metrics: [
        { label: 'New', value: balloon.new || 0 },
        { label: 'Sent', value: balloon.sent || 0 },
        { label: 'Done', value: balloon.done || 0 },
      ],
    },
    {
      title: 'Machines', color: 'cyan', Icon: IconDeviceHeartMonitor,
      metrics: [
        { label: 'Online', value: machines.online || 0 },
        { label: 'Offline', value: machines.offline || 0 },
        { label: 'Total', value: (machines.online || 0) + (machines.offline || 0) },
      ],
    },
  ];
  const rosterMetrics = [
    { label: 'Teams', value: overview.data?.roster.total || 0 },
    { label: 'Schools', value: overview.data?.roster.schools || 0 },
    { label: 'No logos', value: overview.data?.roster.noLogos || 0 },
  ];
  const presentationMetrics = [
    { label: 'Seats', value: overview.data?.roster.total || 0 },
    { label: 'Online IP matches', value: overview.data?.roster.onlineIpMatches || 0 },
    { label: 'Connected teams', value: overview.data?.presentation?.connectedTeams || 0 },
  ];
  const renderDashboardContent = (compact = false) => (
    <>
      {(metrics.isError || overview.isError) && (
        <Alert color={metrics.data || overview.data ? 'yellow' : 'red'} mb="md" title="Refresh failed" icon={<IconAlertCircle />}>
          {metrics.data || overview.data ? 'Showing the most recent available data.' : 'Check the server connection and try again.'}
        </Alert>
      )}

      <Grid columns={10} gutter="md" align="flex-start">
        <Grid.Col span={compact ? 10 : { base: 10, lg: 6 }}>
          <Stack gap="md">
            {overview.data?.contest && (
              <Paper withBorder p="md" radius="md">
                <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
                  <Group align="flex-start" gap="sm">
                    <ThemeIcon variant="light" color="blue" size="lg"><IconSchool size={20} /></ThemeIcon>
                    <div>
                      <Group gap="xs">
                        <Text fw={700}>{overview.data.contest.name}</Text>
                        <Badge color={overview.data.connected ? phase?.color : 'red'} variant="light">
                          {overview.data.connected ? phase?.label : 'Disconnected'}
                        </Badge>
                      </Group>
                      <Text size="xs" c="dimmed" ff="monospace">Contest {overview.data.contest.id}</Text>
                    </div>
                  </Group>
                  <SimpleGrid cols={{ base: 1, xs: 3 }} spacing="xl">
                    <div><Text size="xs" c="dimmed">Starts</Text><Text size="sm">{formatDate(overview.data.contest.startAt)}</Text></div>
                    <div><Text size="xs" c="dimmed">Freeze</Text><Text size="sm">{formatDate(overview.data.contest.freezeAt)}</Text></div>
                    <div><Text size="xs" c="dimmed">Ends</Text><Text size="sm">{formatDate(overview.data.contest.endAt)}</Text></div>
                  </SimpleGrid>
                </Group>
                {!overview.data.connected && (
                  <Text size="xs" c="red" mt="sm">
                    {overview.data.connectionError || 'The OJ connection is unavailable. Showing the last loaded contest information.'}
                  </Text>
                )}
              </Paper>
            )}

            {moduleSummaries.map((module) => (metrics.isPending
              ? <Skeleton key={module.title} h={112} radius="md" />
              : <ModuleSummary key={module.title} {...module} />))}

            {overview.isPending ? <Skeleton h={112} radius="md" /> : (
              <ModuleSummary
                title="Teams"
                color="blue"
                Icon={IconUsersGroup}
                metrics={rosterMetrics}
              />
            )}

            {overview.isPending ? <Skeleton h={112} radius="md" /> : (
              <ModuleSummary
                title="Presentation"
                color="blue"
                Icon={IconServer}
                metrics={presentationMetrics}
              />
            )}
          </Stack>
        </Grid.Col>
        <Grid.Col span={compact ? 10 : { base: 10, lg: 4 }}>
          <DashboardClients data={overview.data?.clients} pending={overview.isPending} />
        </Grid.Col>
      </Grid>
    </>
  );

  if (arenaMode) {
    return (
      <Portal>
        <Box
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 7fr) minmax(360px, 3fr)',
            gridTemplateRows: 'auto minmax(0, 1fr)',
            gap: 16,
            padding: 16,
            overflow: 'hidden',
            background: 'var(--mantine-color-body)',
          }}
        >
          <Paper
            withBorder
            radius="md"
            px="md"
            py="sm"
            style={{ gridColumn: '1 / -1' }}
          >
            <Group justify="space-between" wrap="nowrap">
              <Group gap="sm" wrap="nowrap" miw={0}>
                <img src={hydroLogo} width={32} height={32} alt="Hydro" />
                <Text fw={700} lh={1.2} textWrap="nowrap">XCPC Tools</Text>
                {overview.data?.contest?.name && (
                  <Text size="sm" c="dimmed" truncate>
                    {overview.data.contest.name}
                  </Text>
                )}
              </Group>
              <Button
                size="xs"
                variant="default"
                leftSection={<IconArrowsMinimize size={16} />}
                onClick={exitArenaMode}
              >
                Exit Arena Mode
              </Button>
            </Group>
          </Paper>
          <Paper
            withBorder
            radius="md"
            p="md"
            style={{ display: 'flex', minHeight: 0, flexDirection: 'column', overflow: 'hidden' }}
          >
            {monitor.isError && !monitor.data ? (
              <Alert color="red" title="Unable to load computers" icon={<IconAlertCircle />}>
                Check the server connection and try again.
              </Alert>
            ) : monitor.isPending ? (
              <Skeleton h="100%" radius="md" />
            ) : (
              <ArenaView
                monitors={monitors}
                isLoading={monitor.isFetching && !monitor.isPending}
              />
            )}
          </Paper>
          <Paper withBorder radius="md" style={{ minHeight: 0, overflow: 'hidden' }}>
            <ScrollArea type="auto" h="100%">
              <Box p="md">{renderDashboardContent(true)}</Box>
            </ScrollArea>
          </Paper>
        </Box>
      </Portal>
    );
  }

  return (
    <div>
      <PageHeader
        title="Overview"
        description="Contest services and workstation health at a glance."
        isFetching={(metrics.isFetching && !metrics.isPending) || (overview.isFetching && !overview.isPending)}
        updatedAt={Math.max(metrics.dataUpdatedAt, overview.dataUpdatedAt)}
        actions={(
          <Button
            size="xs"
            variant="default"
            leftSection={<IconArrowsMaximize size={16} />}
            onClick={enterArenaMode}
          >
            Arena Mode
          </Button>
        )}
      />
      {renderDashboardContent()}
    </div>
  );
}
