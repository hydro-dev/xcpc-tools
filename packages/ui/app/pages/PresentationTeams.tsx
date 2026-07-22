import {
  Alert, Badge, Button, FileInput, Group, Menu, Modal, Paper, ScrollArea, SegmentedControl,
  Select, SimpleGrid, Skeleton, Stack, Table, Text, TextInput, ThemeIcon,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import {
  IconAlertCircle, IconCloudDownload, IconDownload, IconFileImport, IconPhotoDown,
  IconSchool, IconSearch, IconUpload,
} from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import React from 'react';
import { PageHeader } from '../components/PageHeader';
import { presentationTeamsQuery } from '../queries';
import './PresentationTeams.css';

const operation = async (name: string, payload: Record<string, unknown> = {}) => {
  const response = await fetch('/presentation-teams', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operation: name, ...payload }),
  });
  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    try {
      const body = await response.json();
      message = body?.error?.message || body?.error || message;
    } catch { /* response is not JSON */ }
    throw new Error(message);
  }
  return response;
};

const sourceLabel = (source: string) => {
  if (source === 'oj') return 'OJ snapshot';
  if (source === 'upload') return 'Local upload';
  return 'Not configured';
};

type ImportMappingField =
  | 'id' | 'name' | 'school' | 'seat'
  | 'member1' | 'member2' | 'member3'
  | 'coach' | 'group';
type ImportMapping = Partial<Record<ImportMappingField, string>>;

const importFields: Array<{ field: ImportMappingField; label: string; required?: boolean }> = [
  { field: 'id', label: 'Team ID' },
  { field: 'name', label: 'Team name', required: true },
  { field: 'school', label: 'School' },
  { field: 'seat', label: 'Seat', required: true },
  { field: 'member1', label: 'Member 1' },
  { field: 'member2', label: 'Member 2' },
  { field: 'member3', label: 'Member 3' },
  { field: 'coach', label: 'Coach' },
  { field: 'group', label: 'Group' },
];

const uploadFormat = (file: File | null) => {
  const filename = file?.name.toLowerCase() || '';
  if (filename.endsWith('.csv')) return 'csv';
  if (filename.endsWith('.tsv')) return 'tsv';
  return 'json';
};

export default function PresentationTeams() {
  const queryClient = useQueryClient();
  const query = useQuery({ ...presentationTeamsQuery(), refetchInterval: 30_000 });
  const [search, setSearch] = React.useState('');
  const [logoStatus, setLogoStatus] = React.useState('all');
  const [busy, setBusy] = React.useState('');
  const [uploadOpened, setUploadOpened] = React.useState(false);
  const [uploadFile, setUploadFile] = React.useState<File | null>(null);
  const [uploadContent, setUploadContent] = React.useState('');
  const [importMode, setImportMode] = React.useState('replace');
  const [importColumns, setImportColumns] = React.useState<string[]>([]);
  const [importMapping, setImportMapping] = React.useState<ImportMapping>({});
  const [preview, setPreview] = React.useState<any>(null);

  const refresh = React.useCallback(async () => {
    await Promise.all([
      query.refetch(),
      queryClient.invalidateQueries({ queryKey: ['overview'] }),
    ]);
  }, [query, queryClient]);

  const run = React.useCallback(async (name: string, task: () => Promise<any>, success: (result: any) => string) => {
    setBusy(name);
    try {
      const result = await task();
      notifications.show({ title: 'Completed', message: success(result), color: 'blue' });
      await refresh();
      return result;
    } catch (error) {
      notifications.show({ title: 'Operation failed', message: error instanceof Error ? error.message : String(error), color: 'red' });
      return null;
    } finally {
      setBusy('');
    }
  }, [refresh]);

  const loadFromOj = () => modals.openConfirmModal({
    title: 'Load the current OJ team list?',
    children: (
      <Text size="sm">
        This replaces the presentation roster with the latest successfully fetched OJ snapshot.
        Teams without a seat are skipped.
      </Text>
    ),
    labels: { confirm: 'Load from OJ', cancel: 'Cancel' },
    onConfirm: () => run(
      'oj',
      async () => (await operation('from_oj')).json(),
      (result) => `Loaded ${result.teams?.length || 0} teams${result.skipped ? `; skipped ${result.skipped} without seats` : ''}.`,
    ),
  });

  const chooseFile = async (file: File | null) => {
    setUploadFile(file);
    setPreview(null);
    setImportColumns([]);
    setImportMapping({});
    if (!file) {
      setUploadContent('');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      notifications.show({ title: 'File too large', message: 'The maximum upload size is 8MB.', color: 'red' });
      setUploadFile(null);
      return;
    }
    const content = await file.text();
    setUploadContent(content);
    setBusy('inspect');
    try {
      const inspected = await (await operation('import_inspect', {
        content,
        format: uploadFormat(file),
      })).json();
      setImportColumns(inspected.columns || []);
      setImportMapping(inspected.suggestedMapping || {});
    } catch (error) {
      notifications.show({
        title: 'Unable to read the file',
        message: error instanceof Error ? error.message : String(error),
        color: 'red',
      });
    } finally {
      setBusy('');
    }
  };

  const format = uploadFormat(uploadFile);
  const previewUpload = async () => {
    const result = await run(
      'preview',
      async () => (await operation('import_preview', {
        content: uploadContent, format, mode: importMode, mapping: importMapping,
      })).json(),
      (value) => (
        value.errors?.length
          ? `Found ${value.errors.length} validation errors.`
          : `${value.summary.valid} teams are ready to import.`
      ),
    );
    if (result) setPreview(result);
  };

  const commitUpload = async () => {
    if (!preview || preview.errors?.length) return;
    const result = await run(
      'commit',
      async () => (await operation('import_commit', {
        content: uploadContent,
        format,
        mode: importMode,
        revision: preview.revision,
        mapping: importMapping,
      })).json(),
      (value) => `Saved ${value.teams?.length || 0} presentation teams.`,
    );
    if (result) {
      setUploadOpened(false);
      setUploadFile(null);
      setUploadContent('');
      setImportColumns([]);
      setImportMapping({});
      setPreview(null);
    }
  };

  const syncAvatars = () => run(
    'avatars',
    async () => (await operation('sync_avatars')).json(),
    (result) => `Matched ${result.matched} schools; ${result.failed} could not be downloaded.`,
  );

  const downloadExport = async (formatName: 'json' | 'csv') => {
    setBusy(`export-${formatName}`);
    try {
      const response = await operation('export', { format: formatName });
      const blob = await response.blob();
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = href;
      anchor.download = `presentation-teams.${formatName}`;
      anchor.click();
      URL.revokeObjectURL(href);
      const matched = response.headers.get('X-Presentation-Matched') || '0';
      const missing = response.headers.get('X-Presentation-Missing') || '0';
      const ambiguous = response.headers.get('X-Presentation-Ambiguous') || '0';
      notifications.show({ title: 'Export ready', message: `${matched} IPs matched, ${missing} missing, ${ambiguous} ambiguous.`, color: 'blue' });
    } catch (error) {
      notifications.show({ title: 'Export failed', message: error instanceof Error ? error.message : String(error), color: 'red' });
    } finally {
      setBusy('');
    }
  };

  const confirmExport = async (formatName: 'json' | 'csv') => {
    setBusy(`export-preview-${formatName}`);
    try {
      const summary = await (await operation('export_preview')).json();
      modals.openConfirmModal({
        title: `Export ${formatName.toUpperCase()} with current IP addresses?`,
        children: (
          <Stack gap="xs">
            <Text size="sm">The export uses workstation reports received during the last two minutes.</Text>
            <SimpleGrid cols={4} spacing="sm">
              <div><Text size="xs" c="dimmed">Teams</Text><Text fw={700} ff="monospace">{summary.total}</Text></div>
              <div><Text size="xs" c="dimmed">Matched</Text><Text fw={700} ff="monospace">{summary.matched}</Text></div>
              <div><Text size="xs" c="dimmed">Missing</Text><Text fw={700} ff="monospace">{summary.missing}</Text></div>
              <div><Text size="xs" c="dimmed">Ambiguous</Text><Text fw={700} ff="monospace">{summary.ambiguous}</Text></div>
            </SimpleGrid>
          </Stack>
        ),
        labels: { confirm: `Download ${formatName.toUpperCase()}`, cancel: 'Cancel' },
        onConfirm: () => downloadExport(formatName),
      });
    } catch (error) {
      notifications.show({
        title: 'Unable to prepare export',
        message: error instanceof Error ? error.message : String(error),
        color: 'red',
      });
    } finally {
      setBusy('');
    }
  };

  const teams = React.useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (query.data?.teams || []).filter((team) => {
      if (logoStatus === 'missing' && team.logo) return false;
      if (logoStatus === 'available' && !team.logo) return false;
      if (!needle) return true;
      return [
        team.seat, team.name, team.displayName, team.school, team.group, team.id,
        ...(team.members || []), team.coach,
      ].join(' ').toLowerCase().includes(needle);
    });
  }, [logoStatus, query.data?.teams, search]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: 'calc(100dvh - var(--app-shell-header-offset, 0rem) - var(--app-shell-padding) - var(--app-shell-padding))',
      minHeight: 0,
    }}>
      <PageHeader
        title="Teams / Presentation"
        description="Prepare presentation info for workstations"
        isFetching={query.isFetching && !query.isPending}
        updatedAt={query.dataUpdatedAt}
        actions={(
          <Group gap="xs">
            <Button
              size="xs"
              variant="default"
              leftSection={<IconCloudDownload size={16} />}
              disabled={!query.data?.ojAvailable}
              loading={busy === 'oj'}
              onClick={loadFromOj}
            >
              Load from OJ
            </Button>
            <Button size="xs" variant="default" leftSection={<IconUpload size={16} />} onClick={() => setUploadOpened(true)}>
              Upload teams
            </Button>
            <Button size="xs" variant="default" leftSection={<IconPhotoDown size={16} />} loading={busy === 'avatars'} onClick={syncAvatars}>
              Fetch logos
            </Button>
            <Menu position="bottom-end">
              <Menu.Target>
                <Button size="xs" leftSection={<IconDownload size={16} />} loading={busy.startsWith('export-')}>Export with IP</Button>
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item onClick={() => confirmExport('json')}>JSON</Menu.Item>
                <Menu.Item onClick={() => confirmExport('csv')}>CSV</Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        )}
      />

      {query.isError && !query.data && (
        <Alert color="red" mb="md" title="Unable to load the presentation roster" icon={<IconAlertCircle />}>
          Check the server connection and retry.
        </Alert>
      )}

      {query.isPending ? <Skeleton h={104} radius="md" mb="md" /> : (
        <Paper withBorder p="md" radius="md" mb="md">
          <Group justify="space-between" wrap="wrap" gap="lg">
            <Group gap="sm">
              <ThemeIcon variant="light" color="blue" size="lg"><IconSchool size={20} /></ThemeIcon>
              <div>
                <Group gap="xs">
                  <Text fw={700}>{query.data?.teams?.length || 0} teams</Text>
                  <Badge variant="light" color={query.data?.source === 'empty' ? 'gray' : 'blue'}>
                    {sourceLabel(query.data?.source)}
                  </Badge>
                </Group>
                <Text size="xs" c="dimmed">
                  {query.data?.updatedAt
                    ? `Saved ${new Date(query.data.updatedAt).toLocaleString()}`
                    : 'Load from the OJ or upload a file to enable workstation presentations.'}
                </Text>
              </div>
            </Group>
            <SimpleGrid cols={3} spacing="xl">
              <div>
                <Text size="xs" c="dimmed">Assigned seats</Text>
                <Text fw={700} ff="monospace">
                  {(query.data?.teams || []).filter((team) => team.seat).length}
                </Text>
              </div>
              <div>
                <Text size="xs" c="dimmed">Local logos</Text>
                <Text fw={700} ff="monospace">
                  {(query.data?.teams || [])
                    .filter((team) => team.logo?.startsWith('/presentation-assets/')).length}
                </Text>
              </div>
              <div>
                <Text size="xs" c="dimmed">OJ status</Text>
                <Text fw={700}>{query.data?.ojConnected ? 'Connected' : query.data?.ojAvailable ? 'Configured' : 'Unavailable'}</Text>
              </div>
            </SimpleGrid>
          </Group>
          <Group justify="space-between" align="flex-end" mt="md" wrap="wrap">
            <Group gap="xs" wrap="wrap">
              <TextInput
                aria-label="Search teams"
                placeholder="Search seat, team or school"
                leftSection={<IconSearch size={16} />}
                value={search}
                onChange={(event) => setSearch(event.currentTarget.value)}
                w={{ base: '100%', sm: 340 }}
              />
              <Select
                aria-label="Filter teams by logo status"
                value={logoStatus}
                onChange={(value) => setLogoStatus(value || 'all')}
                data={[
                  { value: 'all', label: 'All logo statuses' },
                  { value: 'missing', label: 'Missing logo' },
                  { value: 'available', label: 'Has logo' },
                ]}
                allowDeselect={false}
                w={{ base: '100%', sm: 180 }}
              />
            </Group>
            <Text size="xs" c="dimmed">
              Showing {Math.min(teams.length, 500)} of {teams.length}
            </Text>
          </Group>
        </Paper>
      )}

      <Paper withBorder radius="md" style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <ScrollArea h="100%" type="auto" scrollbars="xy">
          <Table className="presentation-teams-table" miw={900} striped highlightOnHover stickyHeader>
            <Table.Thead>
              <Table.Tr>
                <Table.Th className="presentation-teams-seat-cell presentation-teams-seat-header">Seat</Table.Th>
                <Table.Th>Team</Table.Th>
                <Table.Th>School</Table.Th>
                <Table.Th>Members</Table.Th>
                <Table.Th>Group</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {teams.slice(0, 500).map((team) => (
                <Table.Tr key={team.id}>
                  <Table.Td className="presentation-teams-seat-cell">
                    <Text fw={700} ff="monospace">{team.seat}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{team.displayName || team.name}</Text>
                    <Text size="xs" c="dimmed">{team.id}</Text>
                    {(team.ip || team.importedIp) && (
                      <Text size="xs" c="dimmed">IP: {team.ip || team.importedIp}</Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{team.school || '-'}</Text>
                    <Group gap={4} mt={3} wrap="nowrap">
                      <Text size="xs" c="dimmed">Logo:</Text>
                      <Badge size="sm" variant="light" color={team.logo ? 'blue' : 'gray'}>
                        {team.logo?.startsWith('/presentation-assets/')
                          ? 'Cached'
                          : team.logo ? 'Remote' : 'Missing'}
                      </Badge>
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm">{team.members?.join(' / ') || '-'}</Text>
                    <Text size="xs" c="dimmed">Coach: {team.coach || '-'}</Text>
                  </Table.Td>
                  <Table.Td><Text size="sm">{team.group || '-'}</Text></Table.Td>
                </Table.Tr>
              ))}
              {!teams.length && !query.isPending && (
                <Table.Tr>
                  <Table.Td colSpan={5}>
                    <Text ta="center" c="dimmed" py="xl">No matching presentation teams.</Text>
                  </Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      </Paper>

      <Modal opened={uploadOpened} onClose={() => setUploadOpened(false)} title="Upload presentation teams" size="lg">
        <Stack>
          <FileInput
            label="JSON, CSV, or TSV file"
            description="Choose the source column for each roster field after loading the file."
            placeholder="Choose a teams file"
            accept=".json,.csv,.tsv,application/json,text/csv,text/tab-separated-values"
            leftSection={<IconFileImport size={16} />}
            value={uploadFile}
            onChange={chooseFile}
          />
          {busy === 'inspect' && <Text size="xs" c="dimmed">Reading column headers…</Text>}
          {!!importColumns.length && (
            <Paper withBorder p="sm" radius="md">
              <Text fw={600} size="sm">Column mapping</Text>
              <Text size="xs" c="dimmed" mb="sm">
                Team name and seat are required. If Team ID is empty, the seat is used as the ID.
              </Text>
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                {importFields.map(({ field, label, required }) => (
                  <Select
                    key={field}
                    label={label}
                    required={required}
                    placeholder="Do not import"
                    data={importColumns}
                    value={importMapping[field] || null}
                    searchable
                    clearable
                    onChange={(value) => {
                      setImportMapping((current) => ({ ...current, [field]: value || undefined }));
                      setPreview(null);
                    }}
                  />
                ))}
              </SimpleGrid>
            </Paper>
          )}
          <div>
            <Text size="sm" fw={500} mb={6}>Import behavior</Text>
            <SegmentedControl
              fullWidth
              value={importMode}
              onChange={(value) => { setImportMode(value); setPreview(null); }}
              data={[
                { value: 'replace', label: 'Replace current roster' },
                { value: 'merge', label: 'Merge by team ID' },
              ]}
            />
          </div>
          {preview && (
            <Alert color={preview.errors?.length ? 'red' : 'blue'} title={preview.errors?.length ? 'Fix the file before importing' : 'Preview ready'}>
              <Text size="sm">
                {preview.summary.valid} valid, {preview.summary.added} new, {preview.summary.updated} updated, {preview.summary.removed} removed
              </Text>
              {preview.errors?.slice(0, 8).map((error) => <Text size="xs" key={error}>{error}</Text>)}
              {!preview.errors?.length && preview.warnings?.slice(0, 5).map((warning) => <Text size="xs" c="dimmed" key={warning}>{warning}</Text>)}
            </Alert>
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setUploadOpened(false)}>Cancel</Button>
            <Button
              variant="default"
              disabled={!uploadContent || !importColumns.length || !importMapping.name || !importMapping.seat}
              loading={busy === 'preview'}
              onClick={previewUpload}
            >
              Preview
            </Button>
            <Button disabled={!preview || preview.errors?.length} loading={busy === 'commit'} onClick={commitUpload}>Save roster</Button>
          </Group>
        </Stack>
      </Modal>
    </div>
  );
}
