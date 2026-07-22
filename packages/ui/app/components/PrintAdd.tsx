import {
  Button, Fieldset, FileInput, FocusTrap, LoadingOverlay, Modal, Select, TextInput,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconPrinter } from '@tabler/icons-react';
import React, { useState } from 'react';
import { ext2Lang, Languages } from '../utils';

export function PrintTaskAdd({ refresh, groups = [] }) {
  const [opened, { open, close }] = useDisclosure(false);

  const [file, setFile] = useState<File | null>(null);
  const [language, setLanguage] = useState('');
  const [uploading, setUploading] = useState(false);
  const [tname, setTname] = useState('');
  const [location, setLocation] = useState('');
  const [group, setGroup] = useState<string | null>(null);

  const selectFile = (event) => {
    if (!event) {
      setFile(null);
      setLanguage('');
      return;
    }
    const fileExt = event.name.split('.').pop();
    setFile(event);
    setLanguage(ext2Lang[fileExt] || 'txt');
  };

  const uploadPrint = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('lang', language);
      formData.append('team', 'Admin');
      formData.append('tname', tname);
      formData.append('location', location);
      if (group) formData.append('group', group);
      const response = await fetch(`/print/${window.Context.secretRoute}`, {
        method: 'POST',
        body: formData,
      });
      const message = await response.text();
      if (!response.ok) throw new Error(message || `Upload failed (${response.status})`);
      notifications.show({ title: 'Success', message, color: 'green' });
      close();
      refresh();
    } catch (e) {
      console.error(e);
      notifications.show({
        title: 'Error',
        message: e instanceof Error ? e.message : 'Failed to upload file',
        color: 'red',
      });
    } finally {
      setUploading(false);
    }
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
            <TextInput label="Location" placeholder="Seat or location prefix" value={location} onChange={(e) => setLocation(e.currentTarget.value)} />
            <Select
              clearable
              label="Printer group"
              placeholder="Use location prefix"
              value={group}
              onChange={setGroup}
              data={groups}
            />
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
        <Button color="blue" fullWidth mt="md" radius="md" disabled={!file} onClick={uploadPrint}>Submit</Button>
      </Modal>
      <Button
        size="xs"
        variant="default"
        leftSection={<IconPrinter size={15} />}
        onClick={open}
      >
        Print file
      </Button>
    </>
  );
}
