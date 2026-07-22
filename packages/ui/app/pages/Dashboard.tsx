import {
  Alert, Badge, Box, Grid, Group, Paper, SimpleGrid, Skeleton, Stack, Text, ThemeIcon,
} from '@mantine/core';
import {
  IconAlertCircle, IconBalloon, IconDeviceHeartMonitor, IconPrinter, IconSchool,
  IconServer, IconUsersGroup,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import React from 'react';
import { DashboardClients } from '../components/DashboardClients';
import { PageHeader } from '../components/PageHeader';
import { metricsQuery, overviewQuery } from '../queries';

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
  return (
    <div>
      <PageHeader
        title="Overview"
        description="Contest services and workstation health at a glance."
        isFetching={(metrics.isFetching && !metrics.isPending) || (overview.isFetching && !overview.isPending)}
        updatedAt={Math.max(metrics.dataUpdatedAt, overview.dataUpdatedAt)}
      />

      {(metrics.isError || overview.isError) && (
        <Alert color={metrics.data || overview.data ? 'yellow' : 'red'} mb="md" title="Refresh failed" icon={<IconAlertCircle />}>
          {metrics.data || overview.data ? 'Showing the most recent available data.' : 'Check the server connection and try again.'}
        </Alert>
      )}

      <Grid columns={10} gutter="md" align="flex-start">
        <Grid.Col span={{ base: 10, lg: 6 }}>
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
        <Grid.Col span={{ base: 10, lg: 4 }}>
          <DashboardClients data={overview.data?.clients} pending={overview.isPending} />
        </Grid.Col>
      </Grid>
    </div>
  );
}
