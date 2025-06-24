import {
  Group, Paper, SimpleGrid, Text,
} from '@mantine/core';
import {
  IconBalloon, IconChecklist, IconMailCheck, IconMailForward, IconPrinter, IconSend2, IconUser, IconUserCheck, IconUserX,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import React, { useEffect } from 'react';

export function StatsCard({ title, value, Icon }) {
  return (
    <Paper withBorder p="md" radius="md" key={title}>
      <Group justify="space-between">
        <Text size="md" c="dimmed">
          {title}
        </Text>
        <Icon size="2rem" stroke={1.5} />
      </Group>

      <Group align="flex-end" gap="xs" mt={25}>
        <Text size="xl" fw={700}>
          {value}
        </Text>
      </Group>
    </Paper>
  );
}

export default function Dashboard() {
  const query = useQuery({
    queryKey: ['metrics'],
    queryFn: () => fetch('/metrics', {
      headers: { 'Accept': 'application/json' },
    }).then((res) => res.json()),
    refetchInterval: 30000,
  });

  const [machinesOnline, setMachinesOnline] = React.useState(0);
  const [machinesOffline, setMachinesOffline] = React.useState(0);
  const [printTaskNew, setPrintTasksNew] = React.useState(0);
  const [printTaskSent, setPrintTasksSent] = React.useState(0);
  const [printTaskDone, setPrintTasksDone] = React.useState(0);
  const [balloonTaskNew, setBalloonTasksNew] = React.useState(0);
  const [balloonTaskSent, setBalloonTasksSent] = React.useState(0);
  const [balloonTaskDone, setBalloonTasksDone] = React.useState(0);

  useEffect(() => {
    if (!query.data) return;
    const machines: { online: number, offline: number } = { online: 0, offline: 0 };
    for (const metric of query.data.find((d) => d.name === 'xcpc_machinecount').values) {
      machines[metric.labels.status] += metric.value;
    }
    setMachinesOnline(machines.online);
    setMachinesOffline(machines.offline);
    const printTasks: { new: number, sent: number, done: number } = { new: 0, sent: 0, done: 0 };
    for (const metric of query.data.find((d) => d.name === 'xcpc_printcount').values) {
      printTasks[metric.labels.status] += metric.value;
    }
    setPrintTasksNew(printTasks.new);
    setPrintTasksSent(printTasks.sent);
    setPrintTasksDone(printTasks.done);
    const balloonTasks: { new: number, sent: number, done: number } = { new: 0, sent: 0, done: 0 };
    for (const metric of query.data.find((d) => d.name === 'xcpc_ballooncount').values) {
      balloonTasks[metric.labels.status] += metric.value;
    }
    setBalloonTasksNew(balloonTasks.new);
    setBalloonTasksSent(balloonTasks.sent);
    setBalloonTasksDone(balloonTasks.done);
  }, [query.data]);
  return (
    <div>
      <SimpleGrid cols={{ base: 1, xs: 2, md: 3 }} m="lg">
        <StatsCard title="Machines Online" value={machinesOnline} Icon={IconUserCheck} />
        <StatsCard title="Machines Offline" value={machinesOffline} Icon={IconUserX} />
        <StatsCard title="Machines Total" value={machinesOnline + machinesOffline} Icon={IconUser} />
      </SimpleGrid>
      <SimpleGrid cols={{ base: 1, xs: 2, md: 3 }} m="lg">
        <StatsCard title="Print Tasks New" value={printTaskNew} Icon={IconPrinter} />
        <StatsCard title="Print Tasks Sent" value={printTaskSent} Icon={IconMailForward} />
        <StatsCard title="Print Tasks Done" value={printTaskDone} Icon={IconMailCheck} />
      </SimpleGrid>
      <SimpleGrid cols={{ base: 1, xs: 2, md: 3 }} m="lg">
        <StatsCard title="Balloon Tasks New" value={balloonTaskNew} Icon={IconBalloon} />
        <StatsCard title="Balloon Tasks Sent" value={balloonTaskSent} Icon={IconSend2} />
        <StatsCard title="Balloon Tasks Done" value={balloonTaskDone} Icon={IconChecklist} />
      </SimpleGrid>
    </div>
  );
}
