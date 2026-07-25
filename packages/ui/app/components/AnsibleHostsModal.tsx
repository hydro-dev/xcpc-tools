import {
  Button, Group, Modal, Stack, Text, Textarea,
} from '@mantine/core';
import { useClipboard } from '@mantine/hooks';
import {
  IconCopy, IconDownload, IconFileExport,
} from '@tabler/icons-react';
import React from 'react';

interface MonitorRecord {
  _id?: string;
  name?: string;
  group?: string;
  ip?: string;
}

interface AnsibleHostsModalProps {
  monitors: MonitorRecord[];
}

const normalizeHostIdentifier = (value: string, fallback: string) => {
  const normalized = value.trim().replace(/[^A-Za-z0-9_.-]+/g, '_').replace(/^_+|_+$/g, '');
  return normalized || fallback;
};

const normalizeGroupIdentifier = (value: string) => (
  value.trim().replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'ungrouped'
);

const uniqueIdentifier = (base: string, used: Set<string>) => {
  let identifier = base;
  let suffix = 2;
  while (used.has(identifier)) identifier = `${base}_${suffix++}`;
  used.add(identifier);
  return identifier;
};

const buildInventory = (monitors: MonitorRecord[]) => {
  const grouped = new Map<string, MonitorRecord[]>();
  let skipped = 0;
  for (const monitor of monitors) {
    if (!monitor.ip) {
      skipped += 1;
      continue;
    }
    const group = String(monitor.group || '').trim() || 'ungrouped';
    if (!grouped.has(group)) grouped.set(group, []);
    grouped.get(group)!.push(monitor);
  }

  const groups = Array.from(grouped.entries()).sort(([left], [right]) => left.localeCompare(right));
  const usedGroups = new Set<string>();
  const sections = groups.map(([name, machines]) => ({
    id: uniqueIdentifier(`contestants_${normalizeGroupIdentifier(name)}`, usedGroups),
    machines: machines.sort((left, right) => (
      String(left.name || left._id).localeCompare(String(right.name || right._id), undefined, { numeric: true })
    )),
  }));

  const lines = ['[contestants:children]', ...sections.map((section) => section.id)];
  const usedHosts = new Set<string>();
  for (const section of sections) {
    lines.push('', `[${section.id}]`);
    for (const monitor of section.machines) {
      const name = String(monitor.name || '').trim() || String(monitor._id || '');
      const base = normalizeHostIdentifier(name, 'machine');
      const host = uniqueIdentifier(base, usedHosts);
      lines.push(`${host} ansible_host=${monitor.ip}`);
    }
  }
  lines.push('');

  return {
    content: lines.join('\n'),
    groupCount: sections.length,
    hostCount: monitors.length - skipped,
    skipped,
  };
};

export function AnsibleHostsModal({ monitors }: AnsibleHostsModalProps) {
  const [opened, setOpened] = React.useState(false);
  const clipboard = useClipboard({ timeout: 1500 });
  const inventory = React.useMemo(() => buildInventory(monitors), [monitors]);

  const download = () => {
    const url = URL.createObjectURL(new Blob([inventory.content], { type: 'text/plain;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'ansible_hosts';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <Button
        size="xs"
        variant="default"
        leftSection={<IconFileExport size={15} />}
        disabled={!inventory.hostCount}
        onClick={() => setOpened(true)}
      >
        Ansible hosts
      </Button>
      <Modal
        opened={opened}
        onClose={() => setOpened(false)}
        title="Ansible hosts"
        size="xl"
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            {inventory.hostCount} computers in {inventory.groupCount} groups
            {inventory.skipped ? `; ${inventory.skipped} without IP skipped` : ''}.
          </Text>
          <Textarea
            value={inventory.content}
            readOnly
            aria-label="Generated Ansible inventory"
            styles={{
              input: {
                height: '50dvh',
                maxHeight: 480,
                fontFamily: 'var(--mantine-font-family-monospace)',
              },
            }}
          />
          <Group justify="flex-end">
            <Button
              variant="default"
              leftSection={<IconCopy size={16} />}
              onClick={() => clipboard.copy(inventory.content)}
            >
              {clipboard.copied ? 'Copied' : 'Copy'}
            </Button>
            <Button leftSection={<IconDownload size={16} />} onClick={download}>
              Download
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
