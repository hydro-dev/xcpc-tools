import {
  Accordion, ActionIcon, Badge, Button, Center, Group, Modal, Table, Text, ThemeIcon, Tooltip,
} from '@mantine/core';
import { useClipboard, useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconCheck, IconCopy, IconX } from '@tabler/icons-react';
import React from 'react';

function PrintersInfo({ client, refresh }) {
  const [opened, { open, close }] = useDisclosure(false);

  const setPrinter = async (printer, enabled) => {
    try {
      const res = await (await fetch('/client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: client.id, operation: 'set', type: 'printer', printer, enabled,
        }),
      })).json();
      if (res.error) {
        notifications.show({ title: 'Error', message: `${res.error.message}(${res.error.params})`, color: 'red' });
        return;
      }
      notifications.show({ title: 'Success', message: 'Printer Updated', color: 'green' });
    } catch (e) {
      console.error(e);
      notifications.show({ title: 'Error', message: 'Failed to update printer', color: 'red' });
    }
    refresh();
  };

  return (
    <>
      <Modal
        opened={opened}
        onClose={close}
        title="Printer Info"
        size="xl"
        padding="md"
      >
        <Table horizontalSpacing="md" verticalSpacing="xs">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Printer</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Enabled</Table.Th>
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            { client.printersInfo.map((printer: any) => (
              <Table.Tr key={printer.printer}>
                <Table.Td>{printer.printer}</Table.Td>
                <Table.Td><Badge color={printer.status === 'idle' ? 'green' : 'red'}>{printer.status}</Badge></Table.Td>
                <Table.Td>
                  <Badge color={client.printers.includes(printer.printer) ? 'blue' : 'red'}>
                    {client.printers.includes(printer.printer) ? 'Enabled' : 'Disabled'}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  { client.printers.includes(printer.printer) ? (
                    <Button color="red" radius="sm" size="xs" onClick={() => setPrinter(printer.printer, false)}>Disable</Button>
                  ) : (
                    <Button color="blue" radius="sm" size="xs" onClick={() => setPrinter(printer.printer, true)}>Enable</Button>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Modal>
      <Text>Enabled Printers: {client.printers.length} <Button color="blue" radius="sm" size="xs" ml="xs" onClick={open}>View</Button> </Text>
    </>
  );
}

export function PrintClientInfo({ clients, refresh }) {
  const clipboard = useClipboard();

  const removeClient = async (id) => {
    try {
      const res = await (await fetch('/client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, operation: 'remove' }),
      })).json();
      if (res.error) {
        notifications.show({ title: 'Error', message: `${res.error.message}(${res.error.params})`, color: 'red' });
        return;
      }
      notifications.show({ title: 'Success', message: 'Client Removed', color: 'green' });
    } catch (e) {
      console.error(e);
      notifications.show({ title: 'Error', message: 'Failed to remove client', color: 'red' });
    }
    refresh();
  };

  return (
    <Accordion variant='contained' mt="md">
      {clients.map((item) => (
        <Accordion.Item key={item.id} value={item.name}>
          <Accordion.Control
            icon={(<Tooltip label={item.updateAt && item.updateAt > new Date().getTime() - 1000 * 60 ? 'Online' : 'Offline'}>
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
                  clipboard.copy(item.id);
                  notifications.show({ title: 'Success', message: 'ID Copied to clipboard!', color: 'green' });
                }}><IconCopy /></ActionIcon>
              </Tooltip>
              <Tooltip label="Remove">
                <ActionIcon variant="transparent" color="red" aria-label='Remove' ml="xs" onClick={() => removeClient(item.id)}><IconX /></ActionIcon>
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
                { item.printersInfo && <PrintersInfo client={item} refresh={refresh} /> }
              </>
            )}
          </Accordion.Panel>
        </Accordion.Item>
      ))}
    </Accordion>
  );
}
