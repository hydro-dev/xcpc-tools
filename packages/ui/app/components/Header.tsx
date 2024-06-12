import React from 'react';
import {
  Container,
  Group, rem,
  Tabs, Text, Title,
} from '@mantine/core';
import {
  IconBalloonFilled, IconDeviceHeartMonitor, IconHome, IconPrinter,
} from '@tabler/icons-react';
import { useLocation, useNavigate } from 'react-router-dom';

const iconStyle = { width: rem(18), height: rem(18) };

const mainLinks = [
  { link: '/', label: 'Dashboard', icon: <IconHome style={iconStyle} /> },
  { link: '/print', label: 'Print', icon: <IconPrinter style={iconStyle} /> },
  { link: '/balloon', label: 'Balloon', icon: <IconBalloonFilled style={iconStyle} /> },
  { link: '/monitor', label: 'Monitor', icon: <IconDeviceHeartMonitor style={iconStyle} /> },
  { link: '/commands', label: 'Commands', icon: <IconDeviceHeartMonitor style={iconStyle} /> },
];

export function Header() {
  const nowRoute = useLocation().pathname;
  const navigate = useNavigate();

  const mainItems = mainLinks.map((item) => (
    <Tabs.Tab key={item.link} value={item.link} mr="xs" leftSection={item.icon}>
      {item.label}
    </Tabs.Tab>
  ));

  return (
    <header>
      <Container size="xl">
        <Group justify="space-between" h="100%" px="md">
          <Title order={4}>Hydro/XCPC-TOOLS</Title>

          <Group visibleFrom="sm">
            <Text>{window.Context.contest.name}</Text>
          </Group>

          <Group h="100%" gap={0} visibleFrom="sm">
            <Tabs
              variant="pills"
              value={nowRoute}
              onChange={(value) => navigate(value)}
            >
              <Tabs.List>
                {mainItems}
              </Tabs.List>
            </Tabs>
          </Group>

        </Group>
      </Container>
    </header>
  );
}
