import {
  ActionIcon,
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  Divider,
  Group,
  Modal,
  NumberInput,
  ScrollArea,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput,
  Textarea,
  Title,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import {
  IconAlertTriangle,
  IconDeviceFloppy,
  IconPlus,
  IconTrash,
} from '@tabler/icons-react';
import React from 'react';
import type {
  ArenaEditorDraft,
} from '../arena/generator';
import {
  ARENA_SEAT_ID_TEMPLATES,
  createDraft,
  createGenerator,
  generateLayout,
  MAX_AREA_GRID_SIDE,
  MAX_AREA_SEAT_SIDE,
  MAX_ARENA_SEATS,
  normalizeGenerator,
  parseArenaSeatIdTemplate,
  seatIdTemplateGroupWidth,
} from '../arena/generator';
import { mergeGeneratedArenaLayout, parseArenaLayouts } from '../arena/layouts';
import type {
  ArenaGeneratorArea,
  ArenaGeneratorColumnBlank,
  ArenaGeneratorRowBlank,
  ArenaLayoutDocument,
  ArenaLayoutsResponse,
  ArenaSeatDirection,
} from '../arena/types';

interface ArenaLayoutEditorProps {
  opened: boolean;
  onClose: () => void;
  layouts: ArenaLayoutDocument[];
  selectedLayoutId: string | null;
  revision: string;
  onSaved: (response: ArenaLayoutsResponse) => void;
  onConflict: () => void | Promise<unknown>;
}
const PREVIEW_CELL_LIMIT = 5_000;
const layoutJson = (layout?: ArenaLayoutDocument | null) => (layout ? JSON.stringify(layout, null, 2) : '');

export function ArenaLayoutEditor({
  opened,
  onClose,
  layouts,
  selectedLayoutId,
  revision,
  onSaved,
  onConflict,
}: ArenaLayoutEditorProps) {
  const [editingId, setEditingId] = React.useState<string | null>(selectedLayoutId);
  const [draft, setDraft] = React.useState<ArenaEditorDraft>(() => createDraft(
    layouts.find((layout) => layout.id === selectedLayoutId),
  ));
  const [manualJson, setManualJson] = React.useState(() => layoutJson(
    layouts.find((layout) => layout.id === selectedLayoutId),
  ));
  const [manualMode, setManualMode] = React.useState(() => {
    const layout = layouts.find((candidate) => candidate.id === selectedLayoutId);
    return Boolean(layout && !layout.meta?.generator);
  });
  const [saving, setSaving] = React.useState(false);
  const openedRef = React.useRef(false);

  const editingLayout = React.useMemo(
    () => layouts.find((layout) => layout.id === editingId) ?? null,
    [editingId, layouts],
  );
  React.useEffect(() => {
    if (openedRef.current === opened) return;
    openedRef.current = opened;
    if (!opened) return;
    const nextId = selectedLayoutId && layouts.some((layout) => layout.id === selectedLayoutId)
      ? selectedLayoutId
      : layouts[0]?.id ?? null;
    setEditingId(nextId);
    const nextLayout = layouts.find((layout) => layout.id === nextId);
    setDraft(createDraft(nextLayout));
    setManualJson(layoutJson(nextLayout));
    setManualMode(Boolean(nextLayout && !nextLayout.meta?.generator));
  }, [layouts, opened, selectedLayoutId]);

  const template = React.useMemo(() => {
    try {
      return parseArenaSeatIdTemplate(draft.generator.seatIdTemplate);
    } catch {
      return null;
    }
  }, [draft.generator.seatIdTemplate]);
  const groupWidth = seatIdTemplateGroupWidth(draft.generator.seatIdTemplate);
  const groupCapacity = groupWidth ? 26 ** groupWidth : MAX_AREA_GRID_SIDE ** 2;

  const preview = React.useMemo(() => {
    try {
      if (manualMode) {
        const source = JSON.parse(manualJson);
        if (Array.isArray(source)) throw new Error('Edit one layout object at a time');
        const parsed = parseArenaLayouts(source);
        if (parsed.length !== 1) throw new Error('The JSON must contain one layout with sections and grids');
        return { layout: parsed[0], error: '' };
      }
      return { layout: generateLayout(draft), error: '' };
    } catch (error) {
      return { layout: null, error: error instanceof Error ? error.message : 'Unable to generate layout' };
    }
  }, [draft, manualJson, manualMode]);

  const updateDraft = <K extends keyof ArenaEditorDraft>(key: K, value: ArenaEditorDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const updateGenerator = (patch: Partial<ArenaEditorDraft['generator']>) => {
    setDraft((current) => ({
      ...current,
      generator: normalizeGenerator({ ...current.generator, ...patch }),
    }));
  };

  const resizeAreas = (areaRows: number, areaCols: number) => {
    updateGenerator({ areaRows, areaCols });
  };

  const updateArea = (index: number, patch: Partial<ArenaGeneratorArea>) => {
    setDraft((current) => ({
      ...current,
      generator: {
        ...current.generator,
        areas: current.generator.areas.map((area, areaIndex) => {
          if (areaIndex !== index) return area;
          const next = { ...area, ...patch };
          return {
            ...next,
            rowBlanks: next.rowBlanks.map((blank) => ({
              ...blank,
              fromRow: Math.min(blank.fromRow, next.rows),
              toRow: Math.min(blank.toRow, next.rows),
              left: Math.min(blank.left, next.cols),
              right: Math.min(blank.right, next.cols),
            })),
            columnBlanks: next.columnBlanks.map((blank) => ({
              ...blank,
              fromColumn: Math.min(blank.fromColumn, next.cols),
              toColumn: Math.min(blank.toColumn, next.cols),
              top: Math.min(blank.top, next.rows),
              bottom: Math.min(blank.bottom, next.rows),
            })),
          };
        }),
      },
    }));
  };

  const updateRowBlank = (
    areaIndex: number,
    blankIndex: number,
    patch: Partial<ArenaGeneratorRowBlank>,
  ) => {
    const area = draft.generator.areas[areaIndex];
    updateArea(areaIndex, {
      rowBlanks: area.rowBlanks.map((blank, index) => (
        index === blankIndex ? { ...blank, ...patch } : blank
      )),
    });
  };

  const addRowBlank = (areaIndex: number) => {
    const area = draft.generator.areas[areaIndex];
    updateArea(areaIndex, {
      rowBlanks: [...area.rowBlanks, {
        id: `blank-${Date.now().toString(36)}`,
        fromRow: 1,
        toRow: area.rows,
        left: 1,
        right: 0,
      }],
    });
  };

  const removeRowBlank = (areaIndex: number, blankIndex: number) => {
    const area = draft.generator.areas[areaIndex];
    updateArea(areaIndex, {
      rowBlanks: area.rowBlanks.filter((unused, index) => index !== blankIndex),
    });
  };

  const updateColumnBlank = (
    areaIndex: number,
    blankIndex: number,
    patch: Partial<ArenaGeneratorColumnBlank>,
  ) => {
    const area = draft.generator.areas[areaIndex];
    updateArea(areaIndex, {
      columnBlanks: area.columnBlanks.map((blank, index) => (
        index === blankIndex ? { ...blank, ...patch } : blank
      )),
    });
  };

  const addColumnBlank = (areaIndex: number) => {
    const area = draft.generator.areas[areaIndex];
    updateArea(areaIndex, {
      columnBlanks: [...area.columnBlanks, {
        id: `column-blank-${Date.now().toString(36)}`,
        fromColumn: 1,
        toColumn: area.cols,
        top: 1,
        bottom: 0,
      }],
    });
  };

  const removeColumnBlank = (areaIndex: number, blankIndex: number) => {
    const area = draft.generator.areas[areaIndex];
    updateArea(areaIndex, {
      columnBlanks: area.columnBlanks.filter((unused, index) => index !== blankIndex),
    });
  };

  const chooseLayout = (value: string | null) => {
    setEditingId(value);
    const nextLayout = layouts.find((layout) => layout.id === value);
    setDraft(createDraft(nextLayout));
    setManualJson(layoutJson(nextLayout));
    setManualMode(Boolean(nextLayout && !nextLayout.meta?.generator));
  };

  const createNew = () => {
    setEditingId(null);
    setDraft({
      ...createDraft(),
      id: `layout-${Date.now().toString(36)}`,
      generator: createGenerator(),
    });
    setManualJson('');
    setManualMode(false);
  };

  const editJson = () => {
    if (!preview.layout) return;
    const source = mergeGeneratedArenaLayout(layouts, editingId, preview.layout).savedLayout;
    const next = JSON.parse(JSON.stringify(source)) as ArenaLayoutDocument;
    if (next.meta?.generator) delete next.meta.generator;
    if (next.meta && !Object.keys(next.meta).length) delete next.meta;
    setManualJson(layoutJson(next));
    setManualMode(true);
  };

  const persist = async (nextLayouts: ArenaLayoutDocument[], successMessage: string) => {
    setSaving(true);
    try {
      const response = await fetch('/arena-layouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ revision, layouts: nextLayouts }),
      });
      const result = await response.json().catch(() => ({}));
      if (response.status === 409) {
        await onConflict();
        notifications.show({
          title: 'Layouts changed on the server',
          message: 'The latest layouts were loaded. Your draft is still open; review it and save again.',
          color: 'orange',
        });
        return false;
      }
      if (!response.ok) throw new Error(result.error || `Save failed with status ${response.status}`);
      onSaved(result);
      notifications.show({ title: 'Arena layouts updated', message: successMessage, color: 'blue' });
      return true;
    } catch (error) {
      notifications.show({
        title: 'Unable to save arena layouts',
        message: error instanceof Error ? error.message : 'Try again after reloading the layouts.',
        color: 'red',
      });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const save = async () => {
    if (!preview.layout) return;
    const candidate = preview.layout;
    if (!candidate.id.trim() || !candidate.name.trim()) return;
    const duplicate = layouts.some((layout) => layout.id === candidate.id.trim() && layout.id !== editingId);
    if (duplicate) {
      notifications.show({ title: 'Layout id already exists', message: 'Use a unique layout id.', color: 'red' });
      return;
    }
    let next: ArenaLayoutDocument[];
    let savedLayout: ArenaLayoutDocument;
    if (manualMode) {
      next = layouts.map((layout) => JSON.parse(JSON.stringify(layout)) as ArenaLayoutDocument);
      if (candidate.default) next.forEach((layout) => { layout.default = false; });
      const index = next.findIndex((layout) => layout.id === editingId);
      if (index >= 0) next[index] = candidate;
      else next.push(candidate);
      savedLayout = candidate;
    } else {
      ({ layouts: next, savedLayout } = mergeGeneratedArenaLayout(layouts, editingId, candidate));
    }
    if (await persist(next, `${savedLayout.name} is ready to use.`)) {
      setEditingId(savedLayout.id);
      setDraft(createDraft(savedLayout));
      setManualJson(layoutJson(savedLayout));
      setManualMode(!savedLayout.meta?.generator);
    }
  };

  const removeConfirmed = async () => {
    if (!editingId) return;
    const next = layouts
      .filter((layout) => layout.id !== editingId)
      .map((layout) => JSON.parse(JSON.stringify(layout)) as ArenaLayoutDocument);
    if (await persist(next, `${editingLayout?.name || editingId} was removed.`)) {
      const replacement = next[0] ?? null;
      setEditingId(replacement?.id ?? null);
      setDraft(createDraft(replacement));
      setManualJson(layoutJson(replacement));
    }
  };

  const remove = () => {
    if (!editingId) return;
    modals.openConfirmModal({
      title: 'Delete arena layout',
      children: <Text size="sm">Delete {editingLayout?.name || editingId}? This cannot be undone.</Text>,
      labels: { confirm: 'Delete layout', cancel: 'Cancel' },
      confirmProps: { color: 'red' },
      onConfirm: removeConfirmed,
    });
  };

  const areaRowsMax = Math.max(1, Math.min(
    MAX_AREA_GRID_SIDE,
    Math.floor(groupCapacity / Math.max(1, draft.generator.areaCols)),
  ));
  const areaColsMax = Math.max(1, Math.min(
    MAX_AREA_GRID_SIDE,
    Math.floor(groupCapacity / Math.max(1, draft.generator.areaRows)),
  ));
  const maxRowsForArea = (index: number) => {
    const area = draft.generator.areas[index];
    const otherSeats = draft.generator.areas.reduce((sum, candidate, candidateIndex) => (
      sum + (candidateIndex === index ? 0 : candidate.rows * candidate.cols)
    ), 0);
    const templateLimit = template?.rowWidth ? 10 ** template.rowWidth - 1 : MAX_AREA_SEAT_SIDE;
    return Math.max(1, Math.min(
      MAX_AREA_SEAT_SIDE,
      templateLimit,
      Math.floor((MAX_ARENA_SEATS - otherSeats) / Math.max(1, area.cols)),
    ));
  };
  const maxColsForArea = (index: number) => {
    const area = draft.generator.areas[index];
    const otherSeats = draft.generator.areas.reduce((sum, candidate, candidateIndex) => (
      sum + (candidateIndex === index ? 0 : candidate.rows * candidate.cols)
    ), 0);
    const templateLimit = template?.colWidth ? 10 ** template.colWidth - 1 : MAX_AREA_SEAT_SIDE;
    return Math.max(1, Math.min(
      MAX_AREA_SEAT_SIDE,
      templateLimit,
      Math.floor((MAX_ARENA_SEATS - otherSeats) / Math.max(1, area.rows)),
    ));
  };

  const completePreviewSections = preview.layout?.sections ?? [];
  const seatCount = completePreviewSections.reduce(
    (sectionSum, section) => sectionSum + section.grid.reduce(
      (sum, row) => sum + row.reduce((rowSum, seat) => rowSum + (seat ? 1 : 0), 0),
      0,
    ),
    0,
  );
  let renderedCells = 0;
  const previewSections = completePreviewSections.map((section) => {
    const width = section.grid.reduce((max, row) => Math.max(max, row.length), 0);
    const availableRows = width ? Math.max(0, Math.floor((PREVIEW_CELL_LIMIT - renderedCells) / width)) : 0;
    const grid = section.grid.slice(0, availableRows);
    renderedCells += grid.length * width;
    return { ...section, grid };
  }).filter((section) => section.grid.length);
  const totalPreviewCells = completePreviewSections.reduce((sum, section) => (
    sum + section.grid.length * section.grid.reduce((max, row) => Math.max(max, row.length), 0)
  ), 0);
  const previewTruncated = totalPreviewCells > PREVIEW_CELL_LIMIT;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      fullScreen
      title="Arena layout editor"
      styles={{ body: { height: 'calc(100dvh - 60px)', overflow: 'hidden' } }}
    >
      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md" h="100%">
        <ScrollArea h="calc(100dvh - 82px)" pr="md">
          <Stack gap="md" pb="xl">
            <Group align="flex-end" wrap="wrap">
              <Select
                label="Layout"
                placeholder="New layout"
                data={layouts.map((layout) => ({ value: layout.id, label: layout.name }))}
                value={editingId}
                onChange={chooseLayout}
                clearable={false}
                style={{ flex: 1, minWidth: 220 }}
              />
              <Button variant="light" leftSection={<IconPlus size={16} />} onClick={createNew}>
                New layout
              </Button>
              {!manualMode && (
                <Button variant="subtle" disabled={!preview.layout} onClick={editJson}>
                  Edit JSON
                </Button>
              )}
              <Button
                color="red"
                variant="subtle"
                leftSection={<IconTrash size={16} />}
                disabled={!editingId || saving}
                onClick={remove}
              >
                Delete
              </Button>
            </Group>

            {manualMode ? (
              <>
                <Alert color="blue" title="Layout JSON">
                  Edit the native layout fields directly. The editor preserves seatKey, sections, titles, grids, and spacing settings.
                </Alert>
                <Textarea
                  aria-label="Layout JSON"
                  value={manualJson}
                  onChange={(event) => setManualJson(event.currentTarget.value)}
                  autosize
                  minRows={28}
                  styles={{ input: { fontFamily: 'monospace', fontSize: 12 } }}
                />
              </>
            ) : (
              <fieldset style={{
                border: 0, padding: 0, margin: 0, minWidth: 0,
              }}>
                <Stack gap="md">
                <SimpleGrid cols={{ base: 1, sm: 2 }}>
                  <TextInput
                    label="Layout name"
                    value={draft.name}
                    onChange={(event) => updateDraft('name', event.currentTarget.value)}
                    required
                  />
                  <TextInput
                    label="Layout id"
                    value={draft.id}
                    onChange={(event) => updateDraft('id', event.currentTarget.value)}
                    required
                    disabled={Boolean(editingId)}
                  />
                </SimpleGrid>
                <TextInput
                  label="Description"
                  value={draft.description}
                  onChange={(event) => updateDraft('description', event.currentTarget.value)}
                />
                <Group gap="xl" align="flex-end">
                  <Switch
                    label="Default layout"
                    checked={draft.isDefault}
                    onChange={(event) => updateDraft('isDefault', event.currentTarget.checked)}
                  />
                  <Autocomplete
                    label="Seat ID template"
                    data={ARENA_SEAT_ID_TEMPLATES}
                    value={draft.generator.seatIdTemplate}
                    onChange={(value) => updateGenerator({ seatIdTemplate: value })}
                    style={{ flex: 1, minWidth: 260 }}
                  />
                </Group>

                <Divider />
                <Title order={4}>Area grid</Title>
                <SimpleGrid cols={{ base: 2, sm: 4 }}>
                  <NumberInput
                    label="Area rows"
                    min={1}
                    max={areaRowsMax}
                    value={draft.generator.areaRows}
                    onChange={(value) => resizeAreas(Number(value) || 1, draft.generator.areaCols)}
                  />
                  <NumberInput
                    label="Area columns"
                    min={1}
                    max={areaColsMax}
                    value={draft.generator.areaCols}
                    onChange={(value) => resizeAreas(draft.generator.areaRows, Number(value) || 1)}
                  />
                  <NumberInput
                    label="Horizontal aisle"
                    min={0}
                    max={8}
                    value={draft.generator.horizontalGapCells}
                    onChange={(value) => updateGenerator({ horizontalGapCells: Number(value) || 0 })}
                  />
                  <NumberInput
                    label="Vertical aisle"
                    min={0}
                    max={8}
                    value={draft.generator.verticalGapRows}
                    onChange={(value) => updateGenerator({ verticalGapRows: Number(value) || 0 })}
                  />
                </SimpleGrid>
                <Group gap="xl" align="flex-end">
                  <NumberInput
                    label="Seat gap (px)"
                    min={0}
                    max={64}
                    value={draft.generator.seatGap}
                    onChange={(value) => updateGenerator({ seatGap: Number(value) || 0 })}
                    w={180}
                  />
                  <Select
                    label="Seat direction"
                    data={[
                      { value: 'forward', label: 'Forward (1 first)' },
                      { value: 'reverse', label: 'Reverse (N first)' },
                      { value: 'snake-forward', label: 'Snake forward (1 first)' },
                      { value: 'snake-reverse', label: 'Snake reverse (N first)' },
                    ]}
                    value={draft.generator.direction}
                    onChange={(value) => updateGenerator({ direction: value as ArenaSeatDirection })}
                    allowDeselect={false}
                    w={200}
                  />
                </Group>

                <SimpleGrid cols={{ base: 1, sm: 2 }}>
                  {draft.generator.areas.map((area, index) => (
                    <Card key={area.id} withBorder padding="sm" radius="md">
                      <Stack gap="sm">
                        <Group justify="space-between" align="flex-end" wrap="nowrap">
                          <Text fw={600}>Area {index + 1}</Text>
                          <TextInput
                            label="Group"
                            value={area.label}
                            maxLength={groupWidth || 32}
                            onChange={(event) => updateArea(index, { label: event.currentTarget.value.toUpperCase() })}
                            size="xs"
                            w={120}
                          />
                        </Group>
                        <SimpleGrid cols={2} spacing="xs">
                          <NumberInput
                            label="Rows"
                            min={1}
                            max={maxRowsForArea(index)}
                            value={area.rows}
                            onChange={(value) => updateArea(index, { rows: Number(value) || 1 })}
                          />
                          <NumberInput
                            label="Columns"
                            min={1}
                            max={maxColsForArea(index)}
                            value={area.cols}
                            onChange={(value) => updateArea(index, { cols: Number(value) || 1 })}
                          />
                        </SimpleGrid>
                        <Text size="xs" c="dimmed" fw={600}>Row blanks</Text>
                        {area.rowBlanks.map((blank, blankIndex) => (
                          <Group key={blank.id} gap="xs" align="flex-end" wrap="nowrap">
                            <NumberInput
                              label="From row"
                              min={1}
                              max={area.rows}
                              value={blank.fromRow}
                              onChange={(value) => updateRowBlank(index, blankIndex, {
                                fromRow: Number(value) || 1,
                              })}
                              size="xs"
                              style={{ flex: 1, minWidth: 0 }}
                            />
                            <NumberInput
                              label="To row"
                              min={1}
                              max={area.rows}
                              value={blank.toRow}
                              onChange={(value) => updateRowBlank(index, blankIndex, {
                                toRow: Number(value) || 1,
                              })}
                              size="xs"
                              style={{ flex: 1, minWidth: 0 }}
                            />
                            <NumberInput
                              label="Left empty"
                              min={0}
                              max={area.cols}
                              value={blank.left}
                              onChange={(value) => updateRowBlank(index, blankIndex, {
                                left: Number(value) || 0,
                              })}
                              size="xs"
                              style={{ flex: 1, minWidth: 0 }}
                            />
                            <NumberInput
                              label="Right empty"
                              min={0}
                              max={area.cols}
                              value={blank.right}
                              onChange={(value) => updateRowBlank(index, blankIndex, {
                                right: Number(value) || 0,
                              })}
                              size="xs"
                              style={{ flex: 1, minWidth: 0 }}
                            />
                            <ActionIcon
                              color="red"
                              variant="subtle"
                              size="lg"
                              aria-label="Remove row blank range"
                              onClick={() => removeRowBlank(index, blankIndex)}
                            >
                              <IconTrash size={15} />
                            </ActionIcon>
                          </Group>
                        ))}
                        <Button
                          variant="subtle"
                          size="xs"
                          leftSection={<IconPlus size={14} />}
                          onClick={() => addRowBlank(index)}
                          style={{ alignSelf: 'flex-start' }}
                        >
                          Add row blank
                        </Button>
                        <Text size="xs" c="dimmed" fw={600}>Column blanks</Text>
                        {area.columnBlanks.map((blank, blankIndex) => (
                          <Group key={blank.id} gap="xs" align="flex-end" wrap="nowrap">
                            <NumberInput
                              label="From column"
                              min={1}
                              max={area.cols}
                              value={blank.fromColumn}
                              onChange={(value) => updateColumnBlank(index, blankIndex, {
                                fromColumn: Number(value) || 1,
                              })}
                              size="xs"
                              style={{ flex: 1, minWidth: 0 }}
                            />
                            <NumberInput
                              label="To column"
                              min={1}
                              max={area.cols}
                              value={blank.toColumn}
                              onChange={(value) => updateColumnBlank(index, blankIndex, {
                                toColumn: Number(value) || 1,
                              })}
                              size="xs"
                              style={{ flex: 1, minWidth: 0 }}
                            />
                            <NumberInput
                              label="Top empty"
                              min={0}
                              max={area.rows}
                              value={blank.top}
                              onChange={(value) => updateColumnBlank(index, blankIndex, {
                                top: Number(value) || 0,
                              })}
                              size="xs"
                              style={{ flex: 1, minWidth: 0 }}
                            />
                            <NumberInput
                              label="Bottom empty"
                              min={0}
                              max={area.rows}
                              value={blank.bottom}
                              onChange={(value) => updateColumnBlank(index, blankIndex, {
                                bottom: Number(value) || 0,
                              })}
                              size="xs"
                              style={{ flex: 1, minWidth: 0 }}
                            />
                            <ActionIcon
                              color="red"
                              variant="subtle"
                              size="lg"
                              aria-label="Remove column blank range"
                              onClick={() => removeColumnBlank(index, blankIndex)}
                            >
                              <IconTrash size={15} />
                            </ActionIcon>
                          </Group>
                        ))}
                        <Button
                          variant="subtle"
                          size="xs"
                          leftSection={<IconPlus size={14} />}
                          onClick={() => addColumnBlank(index)}
                          style={{ alignSelf: 'flex-start' }}
                        >
                          Add column blank
                        </Button>
                      </Stack>
                    </Card>
                  ))}
                </SimpleGrid>
                </Stack>
              </fieldset>
            )}
          </Stack>
        </ScrollArea>

        <Stack gap="sm" h="100%" style={{ minHeight: 0 }}>
          <Group justify="space-between">
            <div>
              <Title order={4}>Preview</Title>
              <Text size="sm" c="dimmed">
                {seatCount.toLocaleString()} seats
                {previewTruncated ? `, preview limited to ${PREVIEW_CELL_LIMIT.toLocaleString()} cells` : ''}
              </Text>
            </div>
            <Button
              leftSection={<IconDeviceFloppy size={16} />}
              loading={saving}
              disabled={!preview.layout || !preview.layout.id.trim() || !preview.layout.name.trim()}
              onClick={save}
            >
              Save layout
            </Button>
          </Group>
          {preview.error && (
            <Alert color="red" icon={<IconAlertTriangle size={18} />} title="Cannot generate preview">
              {preview.error}
            </Alert>
          )}
          <Card withBorder radius="md" padding="md" style={{ flex: 1, minHeight: 0 }}>
            <ScrollArea h="100%" type="auto">
              <Stack gap="md" align="flex-start" p="sm">
                {previewSections.map((section) => (
                  <Stack key={section.id} gap={4} align="flex-start">
                    <Text size="xs" fw={600}>{section.title || section.id}</Text>
                    {section.grid.map((row, rowIndex) => (
                      <Group key={`${section.id}-preview-row-${rowIndex}`} gap={4} wrap="nowrap">
                        {row.map((seat, colIndex) => (
                          <Box
                            key={`${section.id}-preview-seat-${rowIndex}-${colIndex}`}
                            w={54}
                            h={24}
                            bg={seat ? 'blue.7' : undefined}
                            style={{
                              flex: '0 0 54px',
                              borderRadius: seat ? 4 : 0,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            {seat && <Text c="white" size="9px" ff="monospace">{seat}</Text>}
                          </Box>
                        ))}
                      </Group>
                    ))}
                  </Stack>
                ))}
              </Stack>
            </ScrollArea>
          </Card>
        </Stack>
      </SimpleGrid>
    </Modal>
  );
}
