import {
  ActionIcon, Button, Card, Fieldset,
  Grid, Group, LoadingOverlay, Stack, Tabs, Text, TextInput, Title, Tooltip,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import {
  IconCircleChevronLeft,
  IconDeviceComputerCamera, IconDeviceDesktop, IconInfoCircle, IconTerminal2, IconX,
} from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import mpegts from 'mpegts.js';
import React, { useState } from 'react';
import { formatWifiSignal } from '../utils';

function VideoPlayer({ client, type = 'camera' }) {
  const videoRef = React.useRef(null);
  const needProxy = client && client[type].startsWith('proxy://');
  const src = `${needProxy ? '/stream/' : 'http://'}${client.ip}${client[type].startsWith('proxy://') ? client[type].substring(8) : client[type]}`;
  React.useEffect(() => {
    if (videoRef.current) {
      const player = mpegts.createPlayer({
        type: 'mpegts',
        isLive: true,
        url: src,
      });
      player.attachMediaElement(videoRef.current);
      player.load();
      return () => {
        player.destroy();
      };
    }
    return () => { };
  }, [src]);

  return (
    // Live camera and desktop streams do not provide a captions track.
    // eslint-disable-next-line jsx-a11y/media-has-caption
    <video src={src} ref={videoRef} autoPlay controls style={{ width: '100%' }} />
  );
}

function TerminalPanel({ monitor }) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [error, setError] = React.useState('');
  const [retry, setRetry] = React.useState(0);

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return () => {};
    let socket: WebSocket | null = null;
    let disposed = false;
    let receivedError = false;
    setError('');
    const terminal = new Terminal({
      cursorBlink: true,
      convertEol: true,
      fontSize: 14,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      theme: { background: '#111318', foreground: '#e8eaed', cursor: '#4dabf7' },
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(container);
    fit.fit();
    terminal.writeln('Connecting to workstation...');
    const resize = () => {
      fit.fit();
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'resize', cols: terminal.cols, rows: terminal.rows }));
      }
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    const input = terminal.onData((data) => {
      if (socket?.readyState !== WebSocket.OPEN) return;
      if (socket.bufferedAmount > 256 * 1024) {
        receivedError = true;
        setError('Terminal input buffer is full. Reconnect and try again.');
        socket.close(4008, 'SSH input overflow');
        return;
      }
      socket.send(JSON.stringify({ type: 'input', data }));
    });
    (async () => {
      try {
        const response = await fetch('/ssh/ticket', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ monitorId: monitor._id }),
        });
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.error?.message || `Ticket request failed (${response.status})`);
        }
        const ticket = await response.json();
        if (disposed) return;
        const endpoint = new URL('/ssh/ws', window.location.origin);
        endpoint.protocol = endpoint.protocol === 'https:' ? 'wss:' : 'ws:';
        socket = new WebSocket(endpoint);
        const handleOpen = () => {
          socket?.send(JSON.stringify({
            type: 'auth', ticket: ticket.token, cols: terminal.cols, rows: terminal.rows,
          }));
        };
        const handleMessage = (event: MessageEvent) => {
          const payload = JSON.parse(String(event.data));
          if (payload.type === 'data') {
            const raw = window.atob(payload.data);
            terminal.write(Uint8Array.from(raw, (char) => char.charCodeAt(0)));
          } else if (payload.type === 'ready') {
            terminal.clear();
          } else if (payload.type === 'exit') {
            terminal.writeln(`\r\nSession closed${payload.code === null ? '' : ` (${payload.code})`}.`);
          } else if (payload.type === 'error' || payload.error) {
            receivedError = true;
            const message = payload.message || payload.error?.message || payload.error?.name || 'SSH session failed.';
            setError(message);
            terminal.writeln(`\r\n${message}`);
          }
        };
        const handleError = () => {
          receivedError = true;
          setError('WebSSH connection failed.');
        };
        socket.onopen = handleOpen;
        socket.onmessage = handleMessage;
        socket.onerror = handleError;
        socket.onclose = (event) => {
          if (!disposed && !receivedError && event.code !== 1000) {
            setError(event.reason || 'WebSSH connection closed before the session was ready.');
          }
        };
      } catch (e) {
        setError(e instanceof Error ? e.message : 'WebSSH connection failed.');
      }
    })();
    return () => {
      disposed = true;
      input.dispose();
      observer.disconnect();
      if (socket) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
        socket.close();
      }
      terminal.dispose();
    };
  }, [monitor._id, retry]);

  return (
    <Stack gap="xs" mt="md">
      {error && (
        <Group justify="space-between">
          <Text c="red" size="sm">{error}</Text>
          <Button size="xs" variant="light" onClick={() => setRetry((value) => value + 1)}>Retry</Button>
        </Group>
      )}
      <div
        ref={containerRef}
        style={{
          height: 'min(64vh, 620px)', minHeight: 360, background: '#111318', padding: 8, borderRadius: 8,
        }}
      />
    </Stack>
  );
}

export function MonitorInfo({
  refresh, monitor, tab, back,
}) {
  const [activeTab, setActiveTab] = React.useState(tab);
  const [updating, setUpdating] = useState(false);
  const [name, setName] = useState(monitor.name || '');
  const [group, setGroup] = useState(monitor.group || '');
  const [camera, setCamera] = useState(monitor.camera || '');
  const [desktop, setDesktop] = useState(monitor.desktop || '');
  const wifiSignalText = formatWifiSignal(monitor.wifiSignal);
  React.useEffect(() => {
    setName(monitor.name || '');
    setGroup(monitor.group || '');
    setCamera(monitor.camera || '');
    setDesktop(monitor.desktop || '');
  }, [monitor._id, monitor.camera, monitor.desktop, monitor.group, monitor.name]);

  const updateInfo = React.useCallback(async () => {
    setUpdating(true);
    try {
      const response = await fetch('/monitor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          _id: monitor._id, name, group, camera, desktop, operation: 'update',
        }),
      });
      if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
      const res = await response.json();
      if (res.error) {
        notifications.show({ title: 'Error', message: `${res.error.message}(${res.error.params})`, color: 'red' });
        return;
      }
      notifications.show({ title: 'Success', message: 'Client updated', color: 'green' });
      const refreshed = await refresh();
      const refreshedMonitor = (Object.values(refreshed?.data?.monitors || {}) as any[])
        .find((item) => item._id === monitor._id);
      if (refreshedMonitor) {
        setName(refreshedMonitor.name || '');
        setGroup(refreshedMonitor.group || '');
        setCamera(refreshedMonitor.camera || '');
        setDesktop(refreshedMonitor.desktop || '');
      }
    } catch (e) {
      console.error(e);
      notifications.show({ title: 'Error', message: 'Failed to update client', color: 'red' });
    } finally {
      setUpdating(false);
    }
  }, [monitor._id, name, group, camera, desktop, refresh]);
  return (
    <Card shadow="sm" padding="lg" radius="md" withBorder>
      <Group justify="space-between" mb="xs">
        <Group>
          <Tooltip label="Back to List">
            <ActionIcon variant="transparent" aria-label='Back' onClick={back}><IconCircleChevronLeft /></ActionIcon>
          </Tooltip>
          <Title order={3}>{monitor.name || 'No Name'}</Title>
        </Group>
      </Group>
      <Tabs value={activeTab} onChange={setActiveTab} keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="info">Info</Tabs.Tab>
          {monitor.camera && (<Tabs.Tab value="camera">Camera</Tabs.Tab>)}
          {monitor.desktop && (<Tabs.Tab value="desktop">Desktop</Tabs.Tab>)}
          {window.Context.sshEnabled && (<Tabs.Tab value="terminal" leftSection={<IconTerminal2 size={16} />}>Terminal</Tabs.Tab>)}
        </Tabs.List>

        <Tabs.Panel value="info">
          <Grid>
            <Grid.Col span={{ base: 12, md: 6 }}>
              <Text>Name: {monitor.name || 'No Name'}</Text>
              <Text>Group: {monitor.group}</Text>
              <Text>IP: {monitor.ip}</Text>
              <Text>Mac: {monitor.mac ? (monitor.mac.includes(':') ? monitor.mac : monitor.mac.match(/.{1,2}/g)?.join(':')) : 'Unknown'}</Text>
              <Text>Hostname: {monitor.hostname}</Text>
              <Text>Uptime: {new Date((monitor.uptime || 0) * 1000).toISOString().substring(11, 19)}</Text>
              <Text>Version: {monitor.version}</Text>
              <Text>CPU: {monitor.cpu}</Text>
              <Text>RAM: {(monitor.mem / 1024 / 1024).toFixed(2)}GB</Text>
              <Text>OS: {monitor.os}</Text>
              <Text>Kernel: {monitor.kernel}</Text>
              <Text>Memory Used: {monitor.memUsed ? ((monitor.memUsed / monitor.mem) * 100).toFixed(2) : 0}%</Text>
              <Text>Load: {monitor.load}</Text>
              <Text>Wi-Fi Signal: {wifiSignalText || 'No Data'}</Text>
              <Text>Wi-Fi BSSID: {monitor.wifiBssid || 'No Data'}</Text>
              <Text>Camera Stream URL: {monitor.camera ?? 'No Camera'}</Text>
              <Text>Desktop Stream URL: {monitor.desktop ?? 'No Desktop'}</Text>
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 6 }}>
              <LoadingOverlay visible={updating} zIndex={1000} overlayProps={{ radius: 'sm', blur: 2 }} />
              <Fieldset legend="Edit Info" mb="lg">
                <TextInput label="Client Name" placeholder="Name" value={name} onChange={(e) => setName(e.currentTarget.value)} />
                <TextInput label="Client Group" placeholder="Group" value={group} onChange={(e) => setGroup(e.currentTarget.value)} />
                <TextInput label="Camera Stream" placeholder='Stream URL' value={camera} onChange={(e) => setCamera(e.currentTarget.value)} />
                <TextInput label="Desktop Stream" placeholder='Stream URL' value={desktop} onChange={(e) => setDesktop(e.currentTarget.value)} />
              </Fieldset>
              <Button color="blue" fullWidth mt="md" radius="md" onClick={updateInfo}>Submit</Button>
            </Grid.Col>
          </Grid>
        </Tabs.Panel>
        {monitor.camera && (
          <Tabs.Panel value="camera">
            <VideoPlayer client={monitor} type="camera" />
          </Tabs.Panel>
        )}
        {monitor.desktop && (
          <Tabs.Panel value="desktop">
            <VideoPlayer client={monitor} type="desktop" />
          </Tabs.Panel>
        )}
        {window.Context.sshEnabled && (
          <Tabs.Panel value="terminal">
            <TerminalPanel monitor={monitor} />
          </Tabs.Panel>
        )}
      </Tabs>
    </Card>
  );
}

export function MonitorInfoButton({ monitor, action }) {
  const queryClient = useQueryClient();
  const del = React.useCallback(async (m) => {
    try {
      const response = await fetch('/monitor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ _id: m._id, operation: 'delete' }),
      });
      if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
      const res = await response.json();
      if (res.error) {
        notifications.show({ title: 'Error', message: `${res.error.message}(${res.error.params})`, color: 'red' });
        return;
      }
      notifications.show({ title: 'Success', message: 'Client deleted', color: 'green' });
      await queryClient.invalidateQueries({ queryKey: ['monitor'] });
    } catch (e) {
      console.error(e);
      notifications.show({ title: 'Error', message: 'Failed to delete client', color: 'red' });
    }
  }, [queryClient]);
  const confirmDelete = React.useCallback(() => {
    modals.openConfirmModal({
      title: 'Delete computer',
      children: <Text size="sm">Remove {monitor.name || monitor.hostname || 'this computer'} from the monitor list?</Text>,
      labels: { confirm: 'Delete', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: () => del(monitor),
    });
  }, [del, monitor]);

  return (
    <Group justify="center" gap={2} wrap="nowrap">
      <ActionIcon title="Info" variant="transparent" color="green" aria-label='Info' onClick={() => action(monitor, 'info')}>
        <IconInfoCircle />
      </ActionIcon>
      {monitor.camera && (
        <ActionIcon title="Camera" variant="transparent" color="red" aria-label='Camera' onClick={() => action(monitor, 'camera')}>
          <IconDeviceComputerCamera />
        </ActionIcon>
      )}
      {monitor.desktop && (
        <ActionIcon title="Desktop" variant="transparent" color="blue" aria-label='Desktop' onClick={() => action(monitor, 'desktop')}>
          <IconDeviceDesktop />
        </ActionIcon>
      )}
      <span
        title={window.Context.sshEnabled ? 'WebSSH' : 'WebSSH is disabled in server config'}
        style={{ display: 'inline-flex' }}
      >
        <ActionIcon
          variant="transparent"
          color="blue"
          aria-label="WebSSH"
          disabled={!window.Context.sshEnabled}
          onClick={() => action(monitor, 'terminal')}
        >
          <IconTerminal2 />
        </ActionIcon>
      </span>
      <ActionIcon title="Delete" variant="transparent" color="red" aria-label='Delete' onClick={confirmDelete}>
        <IconX />
      </ActionIcon>
    </Group>
  );
}
