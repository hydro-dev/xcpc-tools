import {
  Button, Fieldset, FileInput, FocusTrap, LoadingOverlay, Modal, Select, TextInput,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import React, { useState } from 'react';
import { ext2Lang, Languages } from '../utils';

export function PrintClientAdd({ refresh }) {
  const [adding, setAdding] = useState(false);
  const [opened, { open, close }] = useDisclosure(false);
  const [name, setName] = useState('');

  const addClient = async () => {
    setAdding(true);
    try {
      const res = await (await fetch('/client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, operation: 'add', type: 'printer' }),
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
        title="Add Client"
        size="md"
        padding="md"
      >
        <LoadingOverlay visible={adding} zIndex={1000} overlayProps={{ radius: 'sm', blur: 2 }} />
        <Fieldset legend="Add Client" mb="lg">
          <FocusTrap active>
            <TextInput label="Client Name" placeholder="Client Name" value={name} onChange={(e) => setName(e.currentTarget.value)} data-autofocus />
          </FocusTrap>
        </Fieldset>
        <Button color="blue" fullWidth mt="md" radius="md" onClick={addClient}>Submit</Button>
      </Modal>
      <Button color="blue" radius="md" onClick={open}>Add Client</Button>
    </>
  );
}

export function PrintTaskAdd({ refresh }) {
  const [opened, { open, close }] = useDisclosure(false);

  const [file, setFile] = useState<File | null>(null);
  const [language, setLanguage] = useState('');
  const [uploading, setUploading] = useState(false);
  const [tname, setTname] = useState('');

  const selectFile = (event) => {
    const fileExt = event.name.split('.').pop();
    setFile(event);
    setLanguage(ext2Lang[fileExt] || 'txt');
  };

  const uploadPrint = async () => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('lang', language);
      formData.append('team', 'Admin');
      formData.append('tname', tname);
      formData.append('location', 'UFO');
      const res = await (await fetch(`/print/${window.Context.secretRoute}`, {
        method: 'POST',
        body: formData,
      })).text();
      notifications.show({ title: 'Success', message: res, color: 'green' });
    } catch (e) {
      console.error(e);
      notifications.show({ title: 'Error', message: 'Failed to upload file', color: 'red' });
    }
    setUploading(false);
    close();
    refresh();
  };

  return (
    <>
      <Modal
        opened={opened}
        onClose={close}
        title="Print File"
        size="md"
        padding="md"
      >
        <LoadingOverlay visible={uploading} zIndex={1000} overlayProps={{ radius: 'sm', blur: 2 }} />
        <Fieldset legend="Print Code" mb="lg">
          <FocusTrap active>
            <TextInput label="tname" placeholder="Team Name" value={tname} onChange={(e) => setTname(e.currentTarget.value)} data-autofocus />
            { /* @ts-ignore */ }
            <FileInput label="Upload Code Files" placeholder='Click To Upload Code Files' value={file} onChange={selectFile} />
            <Select
              label="Code Language"
              placeholder="Select language"
              value={language}
              onChange={setLanguage}
              data={Object.keys(Languages).map((key) => ({ value: key, label: `${Languages[key]} (${key})` }))}
            />
          </FocusTrap>
        </Fieldset>
        <Button color="blue" fullWidth mt="md" radius="md" onClick={uploadPrint}>Submit</Button>
      </Modal>
      <Button color="blue" radius="md" onClick={open}>Print File</Button>
    </>
  );
}
