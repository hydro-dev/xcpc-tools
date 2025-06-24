import {
  ActionIcon, Button, Card, Fieldset, FocusTrap,
  Grid, Group, LoadingOverlay, Tabs, Text, TextInput, Title, Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconCircleChevronLeft,
  IconDeviceComputerCamera, IconDeviceDesktop, IconInfoCircle, IconX,
} from '@tabler/icons-react';
import mpegts from 'mpegts.js';
import React, { useState } from 'react';

function VideoPlayer({ client, type = 'camera' }) {
  const videoRef = React.useRef(null);
  const needProxy = client && client[type].startsWith('proxy://');
  const src = `${needProxy ? '/stream/' : 'http://'}${client.ip}${
    client[type].startsWith('proxy://') ? client[type].substring(8) : client[type]}`;
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
    return () => {};
  }, [src]);

  return (
    <video src={src} ref={videoRef} autoPlay controls style={{ width: '100%' }} />
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

  const updateInfo = async () => {
    setUpdating(true);
    try {
      const res = await (await fetch('/monitor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          _id: monitor._id, name, group, camera, desktop, operation: 'update',
        }),
      })).json();
      if (res.error) {
        notifications.show({ title: 'Error', message: `${res.error.message}(${res.error.params})`, color: 'red' });
        setUpdating(false);
        return;
      }
      notifications.show({ title: 'Success', message: 'Client updated', color: 'green' });
      setName('');
      setGroup('');
      setCamera('');
      setDesktop('');
      monitor = {
        ...monitor, name, group, camera, desktop,
      };
    } catch (e) {
      console.error(e);
      notifications.show({ title: 'Error', message: 'Failed to add client', color: 'red' });
    }
    setUpdating(false);
    refresh();
  };
  return (
    <Card shadow="sm" padding="lg" radius="md" withBorder>
      <Group justify="space-between" mb="xs">
        <Group>
          <Tooltip label="Back to List">
            <ActionIcon variant="transparent" aria-label='Back' onClick={back}><IconCircleChevronLeft /></ActionIcon>
          </Tooltip>
          <Title order={3}>{ monitor.name || 'No Name' }</Title>
        </Group>
      </Group>
      <Tabs value={activeTab} onChange={setActiveTab} keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="info">Info</Tabs.Tab>
          { monitor.camera && (<Tabs.Tab value="camera">Camera</Tabs.Tab>)}
          { monitor.desktop && (<Tabs.Tab value="desktop">Desktop</Tabs.Tab>)}
        </Tabs.List>

        <Tabs.Panel value="info">
          <Grid>
            <Grid.Col span={6}>
              <Text>Name: {monitor.name || 'No Name'}</Text>
              <Text>Group: {monitor.group}</Text>
              <Text>IP: {monitor.ip}</Text>
              <Text>Mac: {(monitor.mac.includes(':') ? monitor.mac : monitor.mac.match(/.{1,2}/g).join(':'))}</Text>
              <Text>Hostname: {monitor.hostname}</Text>
              <Text>Uptime: {new Date((monitor.uptime || 0) * 1000).toISOString().substring(11, 19)}</Text>
              <Text>Version: {monitor.version}</Text>
              <Text>CPU: {monitor.cpu}</Text>
              <Text>RAM: {(monitor.mem / 1024 / 1024).toFixed(2)}GB</Text>
              <Text>OS: {monitor.os}</Text>
              <Text>Kernel: {monitor.kernel}</Text>
              <Text>Memory Used: {monitor.memUsed ? (monitor.memUsed / monitor.mem).toFixed(2) : 0}%</Text>
              <Text>Load: {monitor.load}</Text>
              <Text>Camera Stream URL: {monitor.camera ?? 'No Camera'}</Text>
              <Text>Desktop Stream URL: {monitor.desktop ?? 'No Desktop'}</Text>
            </Grid.Col>
            <Grid.Col span={6}>
              <LoadingOverlay visible={updating} zIndex={1000} overlayProps={{ radius: 'sm', blur: 2 }} />
              <Fieldset legend="Edit Info" mb="lg">
                <FocusTrap active>
                  <TextInput label="Client Name" placeholder="Name" value={name} onChange={(e) => setName(e.currentTarget.value)} data-autofocus />
                  <TextInput label="Client Group" placeholder="Group" value={group} onChange={(e) => setGroup(e.currentTarget.value)} />
                  <TextInput label="Camera Stream" placeholder='Stream URL' value={camera} onChange={(e) => setCamera(e.currentTarget.value)} />
                  <TextInput label="Desktop Stream" placeholder='Stream URL' value={desktop} onChange={(e) => setDesktop(e.currentTarget.value)} />
                </FocusTrap>
              </Fieldset>
              <Button color="blue" fullWidth mt="md" radius="md" onClick={updateInfo}>Submit</Button>
            </Grid.Col>
          </Grid>
        </Tabs.Panel>
        { monitor.camera && (
          <Tabs.Panel value="camera">
            <VideoPlayer client={monitor} type="camera" />
          </Tabs.Panel>
        )}
        { monitor.desktop && (
          <Tabs.Panel value="desktop">
            <VideoPlayer client={monitor} type="desktop" />
          </Tabs.Panel>
        )}
      </Tabs>
    </Card>
  );
}

export function MonitorInfoButton({ monitor, action }) {
  const del = async (m) => {
    try {
      const res = await (await fetch('/monitor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ _id: m._id, operation: 'delete' }),
      })).json();
      if (res.error) {
        notifications.show({ title: 'Error', message: `${res.error.message}(${res.error.params})`, color: 'red' });
        return;
      }
      notifications.show({ title: 'Success', message: 'Client deleted', color: 'green' });
    } catch (e) {
      console.error(e);
      notifications.show({ title: 'Error', message: 'Failed to delete client', color: 'red' });
    }
  };

  return (
    <Group>
      <Tooltip label="Info">
        <ActionIcon variant="transparent" color="green" aria-label='Info' onClick={() => action(monitor, 'info')}><IconInfoCircle /></ActionIcon>
      </Tooltip>
      { monitor.camera && (
        <Tooltip label="Camera">
          <ActionIcon variant="transparent" color="red" aria-label='Camera' onClick={() => action(monitor, 'camera')}>
            <IconDeviceComputerCamera />
          </ActionIcon>
        </Tooltip>
      )}
      { monitor.desktop && (
        <Tooltip label="Desktop">
          <ActionIcon variant="transparent" color="blue" aria-label='Desktop' onClick={() => action(monitor, 'desktop')}>
            <IconDeviceDesktop />
          </ActionIcon>
        </Tooltip>
      )}
      <Tooltip label="Delete">
        <ActionIcon variant="transparent" color="red" aria-label='Delete' onClick={() => del(monitor)}><IconX /></ActionIcon>
      </Tooltip>
    </Group>
  );
}
