import {
  Alert, Badge, Button, Checkbox, FileInput, Group, Modal, Paper, ScrollArea, SegmentedControl,
  Select, SimpleGrid, Skeleton, Stack, Table, Text, TextInput, ThemeIcon,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import {
  IconAlertCircle, IconCloudDownload, IconDownload, IconFileImport, IconPhotoDown,
  IconEye, IconSchool, IconSearch, IconUpload,
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

const previewValue = (value: unknown) => {
  if (Array.isArray(value)) return value.join(', ') || '—';
  return String(value ?? '').trim() || '—';
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

type ExportFormat = 'json' | 'csv' | 'accounts';
const exportFieldOptions = [
  { value: 'id', label: 'Team ID' },
  { value: 'name', label: 'Name' },
  { value: 'display_name', label: 'Display name' },
  { value: 'school', label: 'School' },
  { value: 'member1', label: 'Member 1' },
  { value: 'member2', label: 'Member 2' },
  { value: 'member3', label: 'Member 3' },
  { value: 'coach', label: 'Coach' },
  { value: 'organization_id', label: 'Organization ID' },
  { value: 'seat', label: 'Seat' },
  { value: 'location', label: 'Location' },
  { value: 'group', label: 'Group' },
  { value: 'ip', label: 'IP address' },
  { value: 'logo', label: 'Logo' },
];
const defaultExportFields = exportFieldOptions.map((field) => field.value);

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
  const [logoPreview, setLogoPreview] = React.useState<{ name: string; src: string } | null>(null);
  const [exportOpened, setExportOpened] = React.useState(false);
  const [exportFormat, setExportFormat] = React.useState<ExportFormat>('json');
  const [exportFields, setExportFields] = React.useState(defaultExportFields);
  const [exportSummary, setExportSummary] = React.useState<any>(null);

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

  const loadFromOj = async () => {
    setBusy('oj-preview');
    try {
      const preview = await (await operation('from_oj_preview')).json();
      const { summary } = preview;
      const changes: Array<{ key: string; label: string; color: string; title: string; details: string[] }> = [
        ...(preview.added || []).map((team: any) => ({
          key: `added-${team.id}`,
          label: 'Added',
          color: 'green',
          title: `${team.name} (${team.id})`,
          details: [
            `Seat: ${previewValue(team.seat)}`,
            `School: ${previewValue(team.school)}`,
            `Members: ${previewValue(team.members)}`,
            `Coach: ${previewValue(team.coach)}`,
          ],
        })),
        ...(preview.updated || []).map((team: any) => ({
          key: `updated-${team.id}`,
          label: 'Changed',
          color: 'yellow',
          title: `${team.name} (${team.id})`,
          details: (team.changes || []).map((change: any) => (
            `${change.field}: ${previewValue(change.before)} → ${previewValue(change.after)}`
          )),
        })),
        ...(preview.removed || []).map((team: any) => ({
          key: `removed-${team.id}`,
          label: 'Removed',
          color: 'red',
          title: `${team.name} (${team.id})`,
          details: [
            `Seat: ${previewValue(team.seat)}`,
            `School: ${previewValue(team.school)}`,
            `Members: ${previewValue(team.members)}`,
            `Coach: ${previewValue(team.coach)}`,
          ],
        })),
        ...(preview.skipped || []).map((team: any) => ({
          key: `skipped-${team.id}`,
          label: 'Skipped',
          color: 'gray',
          title: `${team.name} (${team.id})`,
          details: [
            'Seat: missing in OJ',
            `School: ${previewValue(team.school)}`,
            `Members: ${previewValue(team.members)}`,
            `Coach: ${previewValue(team.coach)}`,
          ],
        })),
      ];
      modals.openConfirmModal({
        title: 'Review changes from OJ',
        size: 'xl',
        children: (
          <Stack gap="md">
            <Text size="sm">No local data is changed until you confirm this replacement.</Text>
            <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="sm">
              {[
                { label: 'Current', value: summary.current, color: 'gray' },
                { label: 'From OJ', value: summary.incoming, color: 'blue' },
                { label: 'Added', value: summary.added, color: 'green' },
                { label: 'Changed', value: summary.updated, color: 'yellow' },
                { label: 'Removed', value: summary.removed, color: 'red' },
                { label: 'Skipped', value: summary.skipped, color: 'gray' },
              ].map(({ label, value, color }) => (
                <Paper key={label} withBorder p="xs" radius="sm">
                  <Text size="xs" c="dimmed">{label}</Text>
                  <Text fw={700} ff="monospace" c={color}>{value}</Text>
                </Paper>
              ))}
            </SimpleGrid>
            {changes.length ? (
              <Stack gap={6} mah={360} style={{ overflowY: 'auto' }}>
                {changes.slice(0, 200).map((change) => (
                  <Group key={change.key} gap="xs" align="flex-start" wrap="nowrap">
                    <Badge color={change.color} variant="light" w={74}>{change.label}</Badge>
                    <div style={{ minWidth: 0 }}>
                      <Text size="sm">{change.title}</Text>
                      {change.details.map((detail) => (
                        <Text size="xs" c="dimmed" key={detail}>{detail}</Text>
                      ))}
                    </div>
                  </Group>
                ))}
                {changes.length > 200 && (
                  <Text size="xs" c="dimmed">Showing the first 200 of {changes.length} differences.</Text>
                )}
              </Stack>
            ) : (
              <Text size="sm" c="dimmed">The local roster already matches the OJ roster.</Text>
            )}
          </Stack>
        ),
        labels: { confirm: 'Replace with OJ roster', cancel: 'Cancel' },
        confirmProps: { color: summary.removed ? 'red' : 'blue' },
        onConfirm: () => run(
          'oj',
          async () => (await operation('from_oj', {
            revision: preview.revision,
            snapshotHash: preview.snapshotHash,
          })).json(),
          (result) => `Loaded ${result.teams?.length || 0} teams${result.skipped ? `; skipped ${result.skipped} without seats` : ''}.`,
        ),
      });
    } catch (error) {
      notifications.show({
        title: 'Unable to compare OJ teams',
        message: error instanceof Error ? error.message : String(error),
        color: 'red',
      });
    } finally {
      setBusy('');
    }
  };

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

  const syncAvatars = async () => {
    setBusy('avatars');
    try {
      const result = await (await operation('sync_avatars')).json();
      const failures = Array.isArray(result.failures) ? result.failures : [];
      await refresh();
      modals.open({
        title: 'Logo sync completed',
        size: 'lg',
        children: (
          <Stack gap="md">
            <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
              {[
                { label: 'Matched', value: result.matched, color: 'blue' },
                { label: 'Updated', value: result.updated, color: 'green' },
                { label: 'Already current', value: result.cached, color: 'gray' },
                { label: 'Unavailable', value: result.failed, color: result.failed ? 'red' : 'gray' },
              ].map(({ label, value, color }) => (
                <Paper key={label} withBorder p="xs" radius="sm">
                  <Text size="xs" c="dimmed">{label}</Text>
                  <Text fw={700} ff="monospace" c={color}>{value}</Text>
                </Paper>
              ))}
            </SimpleGrid>
            {result.fallbackReason && (
              <Alert color="yellow" title="GitHub API fallback">
                {result.fallbackReason}. Logos were fetched directly instead.
              </Alert>
            )}
            {failures.length ? (
              <Paper withBorder p="sm" radius="md">
                <Text fw={600} size="sm" mb="sm">Unavailable schools</Text>
                <Stack gap="sm" mah={320} style={{ overflowY: 'auto' }}>
                  {failures.map((failure: any) => (
                    <div key={failure.school}>
                      <Text size="sm" fw={600}>{failure.school}</Text>
                      <Text size="xs" c="dimmed">{failure.reason}</Text>
                    </div>
                  ))}
                </Stack>
                {Number(result.failed) > failures.length && (
                  <Text size="xs" c="dimmed" mt="sm">
                    Showing {failures.length} of {result.failed} unavailable schools.
                  </Text>
                )}
              </Paper>
            ) : (
              <Text size="sm" c="dimmed">All roster schools available in the avatar registry are up to date.</Text>
            )}
          </Stack>
        ),
      });
    } catch (error) {
      notifications.show({
        title: 'Logo sync failed',
        message: error instanceof Error ? error.message : String(error),
        color: 'red',
      });
    } finally {
      setBusy('');
    }
  };

  const downloadExport = async () => {
    setBusy('export');
    try {
      const response = await operation('export', {
        format: exportFormat,
        ...(exportFormat !== 'accounts' && { fields: exportFields }),
      });
      const blob = await response.blob();
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = href;
      anchor.download = exportFormat === 'accounts'
        ? 'accounts.json'
        : `presentation-teams.${exportFormat}`;
      anchor.click();
      URL.revokeObjectURL(href);
      const matched = response.headers.get('X-Presentation-Matched') || '0';
      const missing = response.headers.get('X-Presentation-Missing') || '0';
      const ambiguous = response.headers.get('X-Presentation-Ambiguous') || '0';
      notifications.show({ title: 'Export ready', message: `${matched} IPs matched, ${missing} missing, ${ambiguous} ambiguous.`, color: 'blue' });
      setExportOpened(false);
    } catch (error) {
      notifications.show({ title: 'Export failed', message: error instanceof Error ? error.message : String(error), color: 'red' });
    } finally {
      setBusy('');
    }
  };

  const openExport = async () => {
    setBusy('export-preview');
    try {
      setExportSummary(await (await operation('export_preview')).json());
      setExportOpened(true);
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
              loading={busy === 'oj' || busy === 'oj-preview'}
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
            <Button
              size="xs"
              leftSection={<IconDownload size={16} />}
              loading={busy.startsWith('export')}
              onClick={openExport}
            >
              Export teams
            </Button>
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
                      {team.logo?.startsWith('/presentation-assets/') ? (
                        <Badge
                          component="button"
                          type="button"
                          size="sm"
                          variant="light"
                          color="blue"
                          rightSection={<IconEye size={11} />}
                          style={{ cursor: 'pointer' }}
                          onClick={() => setLogoPreview({
                            name: String(team.school || team.displayName || team.name || 'School logo'),
                            src: String(team.logo),
                          })}
                        >
                          Cached
                        </Badge>
                      ) : (
                        <Badge size="sm" variant="light" color={team.logo ? 'blue' : 'gray'}>
                          {team.logo ? 'Remote' : 'Missing'}
                        </Badge>
                      )}
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

      <Modal opened={exportOpened} onClose={() => setExportOpened(false)} title="Export teams" size="lg" centered>
        <Stack gap="md">
          <Text size="sm">IP addresses are matched from workstation reports received during the last two minutes.</Text>
          {exportSummary && (
            <SimpleGrid cols={4} spacing="sm">
              <div><Text size="xs" c="dimmed">Teams</Text><Text fw={700} ff="monospace">{exportSummary.total}</Text></div>
              <div><Text size="xs" c="dimmed">Matched</Text><Text fw={700} ff="monospace">{exportSummary.matched}</Text></div>
              <div><Text size="xs" c="dimmed">Missing</Text><Text fw={700} ff="monospace">{exportSummary.missing}</Text></div>
              <div><Text size="xs" c="dimmed">Ambiguous</Text><Text fw={700} ff="monospace">{exportSummary.ambiguous}</Text></div>
            </SimpleGrid>
          )}
          <SegmentedControl
            fullWidth
            value={exportFormat}
            onChange={(value) => setExportFormat(value as ExportFormat)}
            data={[
              { value: 'json', label: 'Hydro JSON' },
              { value: 'csv', label: 'CSV' },
              { value: 'accounts', label: 'CLICS accounts.json' },
            ]}
          />
          {exportFormat === 'accounts' ? (
            <Text size="sm" c="dimmed">CLICS account fields are fixed by the specification.</Text>
          ) : (
            <Paper withBorder p="sm" radius="md">
              <Group justify="space-between" mb="sm">
                <Text size="sm" fw={600}>Fields</Text>
                <Group gap="xs">
                  <Button size="xs" variant="subtle" onClick={() => setExportFields(defaultExportFields)}>Select all</Button>
                  <Button size="xs" variant="subtle" onClick={() => setExportFields([])}>Clear</Button>
                </Group>
              </Group>
              <SimpleGrid cols={{ base: 2, sm: 3 }} spacing="xs">
                {exportFieldOptions.map((field) => (
                  <Checkbox
                    key={field.value}
                    label={field.label}
                    checked={exportFields.includes(field.value)}
                    onChange={(event) => setExportFields((current) => {
                      const selected = new Set(current);
                      if (event.currentTarget.checked) selected.add(field.value);
                      else selected.delete(field.value);
                      return exportFieldOptions.map((option) => option.value).filter((value) => selected.has(value));
                    })}
                  />
                ))}
              </SimpleGrid>
            </Paper>
          )}
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setExportOpened(false)}>Cancel</Button>
            <Button
              leftSection={<IconDownload size={16} />}
              disabled={exportFormat !== 'accounts' && !exportFields.length}
              loading={busy === 'export'}
              onClick={downloadExport}
            >
              Download
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={Boolean(logoPreview)}
        onClose={() => setLogoPreview(null)}
        title={logoPreview?.name || 'School logo'}
        centered
        size="sm"
      >
        {logoPreview && (
          <img
            src={logoPreview.src}
            alt={`${logoPreview.name} logo`}
            style={{ display: 'block', maxWidth: '100%', maxHeight: '60dvh', margin: '0 auto', objectFit: 'contain' }}
          />
        )}
      </Modal>

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
