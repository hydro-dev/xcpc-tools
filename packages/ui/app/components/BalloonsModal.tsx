import React, { useState } from 'react';
import {
  Button, ColorInput, Fieldset, Modal, Text,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { convertToChinese, convertToColor } from '../utils';

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
