import React, { useState } from 'react';
import {
  Accordion,
  ActionIcon,
  Button, Center, ColorInput, Fieldset, FocusTrap, Group, LoadingOverlay, Modal, Text,
  TextInput, ThemeIcon, Tooltip,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconCheck, IconCopy, IconX } from '@tabler/icons-react';
import { convertToChinese, convertToColor } from '../utils';

export function BalloonsClient({ clients, refresh }) {
  const [adding, setAdding] = useState(false);
  const [opened, { open, close }] = useDisclosure(false);
  const [name, setName] = useState('');

  const addClient = async () => {
    setAdding(true);
    try {
      const res = await (await fetch('/client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, operation: 'add', type: 'balloon' }),
      })).json();
      if (res.error) {
        notifications.show({ title: 'Error', message: `${res.error.message}(${res.error.params})`, color: 'red' });
        setAdding(false);
        return;
      }
      notifications.show({ title: 'Success', message: 'Client added', color: 'green' });
      setName('');
    } catch (e) {
      console.error(e);
      notifications.show({ title: 'Error', message: 'Failed to add client', color: 'red' });
    }
    setAdding(false);
    close();
    refresh();
  };
  return (
    <>
      <Modal
        opened={opened}
        onClose={() => { close(); setName(''); }}
        title="Clients"
        size="md"
        padding="md"
      >
        <Fieldset legend="Add Client" mb="lg">
          <LoadingOverlay visible={adding} zIndex={1000} overlayProps={{ radius: 'sm', blur: 2 }} />
          <FocusTrap active>
            <TextInput label="Client Name" placeholder="Client Name" value={name} onChange={(e) => setName(e.currentTarget.value)} data-autofocus />
          </FocusTrap>
          <Button color="blue" fullWidth mt="md" radius="md" onClick={addClient}>Submit</Button>
        </Fieldset>
        <Fieldset legend="Clients" mb="lg">
          <Accordion>
            {clients.map((item) => (
              <Accordion.Item key={item.id} value={item.name}>
                <Accordion.Control
                  icon={(<Tooltip label={item.updateAt || item.updateAt > new Date().getTime() - 1000 * 60 ? 'Online' : 'Offline'}>
                    <ThemeIcon radius="xl" size="sm" color={item.updateAt ? 'green' : 'red'}>
                      { item.updateAt ? (<IconCheck />) : (<IconX />)}
                    </ThemeIcon>
                  </Tooltip>)}
                >
                  <Tooltip label={`${item.name}(${item.id})`}>
                    <Text>{item.name}({item.id})</Text>
                  </Tooltip>
                </Accordion.Control>
                <Accordion.Panel>
                  <Group justify="center" gap="md">
                    <Text>ID: {item.id}</Text>
                    <Tooltip label="Copy ID">
                      <ActionIcon variant="transparent" color="blue" aria-label='Copy ID' ml="xs" onClick={() => {
                        notifications.show({ title: 'Success', message: 'ID Copied to clipboard!', color: 'green' });
                      }}><IconCopy /></ActionIcon>
                    </Tooltip>
                  </Group>
                  { !item.updateAt ? (
                    <Center mt="md">
                      <Text c="dimmed">Have not connected yet</Text>
                    </Center>
                  ) : (
                    <>
                      <Text>IP: {item.ip}</Text>
                      <Text>Updated At: {new Date(item.updateAt).toLocaleString()}</Text>
                    </>
                  )}
                </Accordion.Panel>
              </Accordion.Item>
            ))}
          </Accordion>
        </Fieldset>
      </Modal>
      <Button color="blue" radius="md" onClick={open}>Client Info</Button>
    </>
  );
}

export function BallonColorChecker() {
  const [opened, { open, close }] = useDisclosure(false);
  const [value, setValue] = useState('');

  return (
    <>
      <Modal
        opened={opened}
        onClose={() => { close(); }}
        title="Clients"
        size="md"
        padding="md"
      >
        <Fieldset legend="Color Checker" mb="lg">
          <ColorInput value={value} onChange={setValue} />
          <Text mt="md">Color: {convertToColor(value)}</Text>
          <Text mt="md">颜色: {convertToChinese(convertToColor(value))}</Text>
        </Fieldset>
      </Modal>
      <Button color="blue" radius="md" onClick={open}>Color Checker</Button>
    </>
  );
}
