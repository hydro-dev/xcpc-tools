import { Button, ColorInput, Fieldset, Modal, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconPalette } from '@tabler/icons-react';
import React, { useState } from 'react';
import { getBalloonName } from '@hydrooj/xcpc-tools/utils/color';

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
          <Text mt="md">Color: {getBalloonName(value)}</Text>
          <Text mt="md">颜色: {getBalloonName(value, 'zh')}</Text>
        </Fieldset>
      </Modal>
      <Button
        size="xs"
        variant="default"
        leftSection={<IconPalette size={15} />}
        onClick={open}
      >
        Color checker
      </Button>
    </>
  );
}
