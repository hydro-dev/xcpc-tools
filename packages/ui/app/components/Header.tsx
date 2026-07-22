import './Header.css';

import {
  ActionIcon, Box, Container, Group, Menu, rem, Text, Tooltip, UnstyledButton,
} from '@mantine/core';
import {
  IconBalloonFilled, IconDeviceHeartMonitor, IconHome, IconMenu2,
  IconPrinter, IconTerminal2, IconUsersGroup,
} from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { queriesForPath } from '../queries';

const iconStyle = { width: rem(16), height: rem(16) };
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

export function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const prefetch = React.useCallback((route: string) => {
    for (const options of queriesForPath(route)) queryClient.prefetchQuery(options).catch(() => undefined);
  }, [queryClient]);
  const open = React.useCallback((route: string) => {
    if (route !== location.pathname) navigate(route);
  }, [location.pathname, navigate]);
  const events = (route: string) => ({
    onMouseEnter: () => prefetch(route),
    onFocus: () => prefetch(route),
    onClick: () => open(route),
  });

  return (
    <header className="admin-nav">
      <Container size="xl" h="100%">
        <div className="admin-nav__layout">
          <Group className="admin-nav__brand" gap={8} wrap="nowrap">
            <Text fw={700} size="sm" lh={1} textWrap="nowrap">Hydro/XCPC-TOOLS</Text>
            <Text size="xs" c="dimmed" truncate visibleFrom="sm">
              {window.Context.contest?.name}
            </Text>
          </Group>

          <Group className="admin-nav__links" gap={2} visibleFrom="lg" wrap="nowrap">
            {mainLinks.map((item) => {
              const active = location.pathname === item.path;
              return (
                <UnstyledButton
                  key={item.id}
                  className="admin-nav__link"
                  data-active={active || undefined}
                  aria-current={active ? 'page' : undefined}
                  {...events(item.path)}
                >
                  <item.Icon style={iconStyle} stroke={1.8} />
                  <span>{item.label}</span>
                </UnstyledButton>
              );
            })}
          </Group>

          <Box className="admin-nav__mobile" hiddenFrom="lg">
            <Menu position="bottom-end" shadow="md" width={230}>
              <Tooltip label="Open navigation">
                <Menu.Target>
                  <ActionIcon variant="subtle" color="blue" aria-label="Open navigation">
                    <IconMenu2 size={20} />
                  </ActionIcon>
                </Menu.Target>
              </Tooltip>
              <Menu.Dropdown>
                {mainLinks.map((item) => (
                  <Menu.Item
                    key={item.id}
                    className="admin-nav__mobile-item"
                    data-active={location.pathname === item.path || undefined}
                    aria-current={location.pathname === item.path ? 'page' : undefined}
                    leftSection={<item.Icon style={iconStyle} />}
                    fw={location.pathname === item.path ? 700 : undefined}
                    {...events(item.path)}
                  >
                    {item.label}
                  </Menu.Item>
                ))}
              </Menu.Dropdown>
            </Menu>
          </Box>
        </div>
      </Container>
    </header>
  );
}
