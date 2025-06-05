import {
  Button, LoadingOverlay, Modal, Textarea,
  TextInput,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import React, { useState } from 'react';

export function MonitorBatchModal({ refresh }) {
  const [opened, { open, close }] = useDisclosure(false);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [group, setGroup] = useState('');
  const [camera, setCamera] = useState('');
  const [desktop, setDesktop] = useState('');
  const [ips, setIps] = useState('');

  const action = async () => {
    setLoading(true);
    try {
      const res = await (await fetch('/monitor', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name, group, camera, desktop, operation: 'update_all', ...ips ? { ips } : {},
        }),
      })).text();
      notifications.show({ title: 'Success', message: res, color: 'green' });
    } catch (e) {
      console.error(e);
      notifications.show({ title: 'Error', message: 'Failed to upload file', color: 'red' });
    }
    setLoading(false);
    close();
    refresh();
  };

  return (
    <>
      <Modal
        opened={opened}
        onClose={close}
        title="Batch Operation"
        size="md"
        padding="md"
      >
        <LoadingOverlay visible={loading} zIndex={1000} overlayProps={{ radius: 'sm', blur: 2 }} />
        <TextInput label="name" placeholder="Monitor Name" value={name} onChange={(e) => setName(e.currentTarget.value)} data-autofocus />
        <TextInput label="group" placeholder="Group Name" value={group} onChange={(e) => setGroup(e.currentTarget.value)} />
        <TextInput label="camera" placeholder="Camera URL" value={camera} onChange={(e) => setCamera(e.currentTarget.value)} />
        <TextInput label="desktop" placeholder="Desktop URL" value={desktop} onChange={(e) => setDesktop(e.currentTarget.value)} />
        <Textarea label="ips" placeholder="IPs" value={ips} onChange={(e) => setIps(e.currentTarget.value)} />
        <Button color="blue" fullWidth mt="md" radius="md" onClick={action}>Submit</Button>
      </Modal>
      <Button variant="outline" onClick={open}>Batch Operation</Button>
    </>
  );
}
