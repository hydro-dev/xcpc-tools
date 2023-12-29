import React, { useState } from 'react';
import {
  ActionIcon,
  Button, Center, Fieldset, FocusTrap, Grid, LoadingOverlay, Modal, Tabs, Text,
  TextInput, Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import {
  IconDeviceComputerCamera, IconDeviceComputerCameraOff, IconDeviceDesktop, IconDeviceDesktopOff, IconInfoCircle,
} from '@tabler/icons-react';

export function MonitorInfo({ refresh, monitor }) {
  const [activeTab, setActiveTab] = React.useState('all');
  const [updating, setUpdating] = useState(false);
  const [opened, { open, close }] = useDisclosure(false);
  const [name, setName] = useState(monitor.name || '');
  const [group, setGroup] = useState(monitor.group || '');

  const openModal = (tab) => {
    setActiveTab(tab);
    open();
  };

  const updateInfo = async () => {
    setUpdating(true);
    try {
      const res = await (await fetch('/monitor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          _id: monitor._id, name, group, operation: 'update',
        }),
      })).json();
      if (res.error) {
        notifications.show({ title: 'Error', message: `${res.error.message}(${res.error.params})`, color: 'red' });
        setUpdating(false);
        return;
      }
      notifications.show({ title: 'Success', message: 'Client added', color: 'green' });
      setName('');
      setGroup('');
    } catch (e) {
      console.error(e);
      notifications.show({ title: 'Error', message: 'Failed to add client', color: 'red' });
    }
    setUpdating(false);
    close();
    refresh();
  };
  return (
    <>
      <Modal
        opened={opened}
        onClose={() => { close(); setName(''); }}
        title="Client Info"
        size="lg"
        padding="md"
      >
        <Tabs value={activeTab} onChange={setActiveTab}>
          <Tabs.List>
            <Tabs.Tab value="info">Info</Tabs.Tab>
            <Tabs.Tab value="camera">Camera</Tabs.Tab>
            <Tabs.Tab value="desktop">Desktop</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="info">
            <Grid>
              <Grid.Col span={6}>
                <Text>Name: {monitor.name || 'No Name'}</Text>
                <Text>IP: {monitor.ip}</Text>
                <Text>Mac: {monitor.mac}</Text>
                <Text>Uptime: {new Date((monitor.uptime || 0) * 1000).toISOString().substring(11, 19)}</Text>
                <Text>Version: {monitor.version}</Text>
                <Text>CPU: {monitor.cpu}</Text>
                <Text>RAM: {monitor.mem}</Text>
                <Text>OS: {monitor.os}</Text>
                <Text>Kernel: {monitor.kernel}</Text>
                <Text>Usage: {monitor.cpuUsage}%/{monitor.memUsage
                  ? (monitor.memUsage.match(/(\d+)/)[0] / monitor.mem.match(/(\d+)/)[0] * 100).toFixed(2) : 0}%
                </Text>
                <Text>Load: {monitor.load}</Text>
              </Grid.Col>
              <Grid.Col span={6}>
                <LoadingOverlay visible={updating} zIndex={1000} overlayProps={{ radius: 'sm', blur: 2 }} />
                <Fieldset legend="Edit Info" mb="lg">
                  <FocusTrap active>
                    <TextInput label="Client Name" placeholder="Name" value={name} onChange={(e) => setName(e.currentTarget.value)} data-autofocus />
                    <TextInput label="Client Group" placeholder="Group" value={group} onChange={(e) => setGroup(e.currentTarget.value)} />
                  </FocusTrap>
                </Fieldset>
                <Button color="blue" fullWidth mt="md" radius="md" onClick={updateInfo}>Submit</Button>
              </Grid.Col>
            </Grid>
          </Tabs.Panel>

          <Tabs.Panel value="camera">
            <Center>
              <IconDeviceComputerCameraOff size={100} />
            </Center>
            { /* <VideoPlayer url={`http://${monitor.ip}:8080/`} /> */}
          </Tabs.Panel>

          <Tabs.Panel value="desktop">
            <Center>
              <IconDeviceDesktopOff size={100} />
            </Center>
            { /* <VideoPlayer url={`http://${monitor.ip}:9090/`} /> */}
          </Tabs.Panel>

        </Tabs>
      </Modal>
      <Tooltip label="Info">
        <ActionIcon variant="transparent" color="green" aria-label='Info' onClick={() => openModal('info')}><IconInfoCircle /></ActionIcon>
      </Tooltip>
      <Tooltip label="Camera">
        <ActionIcon variant="transparent" color="red" aria-label='Camera' onClick={() => openModal('camera')}>
          <IconDeviceComputerCamera />
        </ActionIcon>
      </Tooltip>
      <Tooltip label="Desktop">
        <ActionIcon variant="transparent" color="blue" aria-label='Desktop' onClick={() => openModal('desktop')}>
          <IconDeviceDesktop />
        </ActionIcon>
      </Tooltip>
    </>
  );
}
