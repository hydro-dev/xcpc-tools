import {
  ActionIcon, Container, Group, Menu, rem, Tabs, Text, Title,
} from '@mantine/core';
import {
  IconBalloonFilled, IconDeviceHeartMonitor, IconHome, IconMenu2,
  IconPrinter, IconTerminal2, IconUsersGroup,
} from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import hydroLogo from '../../../machine-tools/frontend/public/hydro.png?inline';
import { queriesForPath } from '../queries';

const iconStyle = { width: rem(18), height: rem(18) };
const mainLinks = [{
  id: 'dashboard', path: '/', label: 'Dashboard', Icon: IconHome,
}, {
  id: 'print', path: '/print', label: 'Print', Icon: IconPrinter,
}, {
  id: 'balloon', path: '/balloon', label: 'Balloon', Icon: IconBalloonFilled,
}, {
  id: 'monitor', path: '/monitor', label: 'Monitor', Icon: IconDeviceHeartMonitor,
}, {
  id: 'commands', path: '/commands', label: 'Commands', Icon: IconTerminal2,
}, {
  id: 'presentation-teams', path: '/presentation-teams', label: 'Teams', Icon: IconUsersGroup,
}];
const clientLinks = [{
  id: 'client-overview', path: '/', label: 'Overview', Icon: IconHome,
}, {
  id: 'client-print', path: '/print', label: 'Print', Icon: IconPrinter,
}, {
  id: 'client-balloon', path: '/balloon', label: 'Balloon', Icon: IconBalloonFilled,
}];

export function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const clientMode = Boolean(window.Context.clientMode);
  const links = clientMode ? clientLinks : mainLinks;
  const prefetch = React.useCallback((route: string) => {
    if (clientMode) return;
    for (const options of queriesForPath(route)) queryClient.prefetchQuery(options).catch(() => undefined);
  }, [clientMode, queryClient]);
  const open = React.useCallback((route: string) => {
    if (route !== location.pathname) navigate(route);
  }, [location.pathname, navigate]);
  const prefetchEvents = (route: string) => ({
    onMouseEnter: () => prefetch(route),
    onFocus: () => prefetch(route),
  });

  return (
    <Container size="xl" h="100%">
      <Group h="100%" justify="space-between" gap="md" wrap="nowrap">
        <Group gap="sm" wrap="nowrap" miw={0}>
          <img src={hydroLogo} width={28} height={28} alt="Hydro" />
          <Title order={4} lh={1} textWrap="nowrap">XCPC Tools</Title>
          <Text size="sm" c="dimmed" truncate visibleFrom="sm">
            {clientMode ? 'Local client' : window.Context.contest?.name}
          </Text>
        </Group>

        <Tabs
          value={location.pathname}
          onChange={(route) => route && open(route)}
          h="100%"
          visibleFrom="lg"
        >
          <Tabs.List h="100%">
            {links.map((item) => (
              <Tabs.Tab
                key={item.id}
                value={item.path}
                h="100%"
                px="sm"
                leftSection={<item.Icon style={iconStyle} stroke={1.8} />}
                {...prefetchEvents(item.path)}
              >
                {item.label}
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs>

        <Menu position="bottom-end" width={200}>
          <Menu.Target>
            <ActionIcon variant="default" size="lg" aria-label="Open navigation" hiddenFrom="lg">
              <IconMenu2 size={20} stroke={1.8} />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            {links.map((item) => {
              const active = location.pathname === item.path;
              return (
                <Menu.Item
                  key={item.id}
                  color={active ? 'blue' : undefined}
                  aria-current={active ? 'page' : undefined}
                  leftSection={<item.Icon style={iconStyle} stroke={1.8} />}
                  fw={active ? 600 : undefined}
                  onClick={() => open(item.path)}
                  {...prefetchEvents(item.path)}
                >
                  {item.label}
                </Menu.Item>
              );
            })}
          </Menu.Dropdown>
        </Menu>
      </Group>
    </Container>
  );
}
