import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Card,
  FileButton,
  Group,
  LoadingOverlay,
  ScrollArea,
  SegmentedControl,
  Select,
  Stack,
  Text,
  ThemeIcon,
  Title,
  Tooltip,
  useMantineTheme,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconAlertTriangle,
  IconInfoCircle,
  IconRouter,
  IconTrash,
  IconUpload,
  IconWifi,
  IconZoomIn,
  IconZoomOut,
  IconZoomReset,
} from '@tabler/icons-react';
import React from 'react';
import type { ArenaLayoutDocument, ArenaLayoutSectionDocument } from '../arena/types';

interface MonitorRecord {
  _id: string;
  name?: string;
  group?: string;
  hostname?: string;
  ip?: string;
  load?: string;
  wifiSignal?: number;
  wifiBssid?: string;
  updateAt?: number;
  uptime?: number;
  version?: string;
  mac?: string;
}

const ONLINE_THRESHOLD_MS = 120 * 1000;
const SEAT_ASPECT_RATIO = 3;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 2.5;
const ZOOM_STEP = 0.1;

const getMonitorSeatId = (
  monitor: MonitorRecord,
  layout: ArenaLayoutDocument | null,
): string | null => {
  if (!monitor) return null;
  if (!layout?.seatKey) {
    return monitor.name ?? monitor.hostname ?? null;
  }
  const path = layout.seatKey.split('.');
  let value: any = monitor;
  for (const key of path) {
    if (value == null) break;
    value = value[key as keyof typeof value];
  }
  if (value == null || value === '') return monitor.name ?? monitor.hostname ?? null;
  return String(value);
};

const getSignalColor = (signal: number, fallback: string): string => {
  if (Number.isNaN(signal)) return fallback;
  const clamped = Math.max(-90, Math.min(-35, signal));
  const ratio = (clamped + 90) / 55;
  const hue = 120 * ratio;
  return `hsl(${Math.round(hue)}, 80%, 45%)`;
};

const hashToColor = (value: string): string => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  const saturation = 55 + (hash % 30);
  const lightness = 45 + (hash % 20) / 2;
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
};

type ArenaViewMode = 'signal' | 'bssid' | 'status';

const viewModeOptions: { value: ArenaViewMode; label: string }[] = [
  { value: 'signal', label: 'Signal Quality' },
  { value: 'bssid', label: 'BSSID' },
  { value: 'status', label: 'Online Status' },
];

const defaultNormalize = (value: string): string => value.trim().toUpperCase();

const normalizers: Record<string, (value: string) => string> = {
  none: (value: string) => value,
  upper: (value: string) => value.toUpperCase(),
  lower: (value: string) => value.toLowerCase(),
  trim: (value: string) => value.trim(),
  'trim-upper': defaultNormalize,
  'trim-lower': (value: string) => value.trim().toLowerCase(),
};

const STORAGE_KEY = 'xcpc-tools/arena-layouts';
const DEFAULT_LAYOUT_KEY = 'xcpc-tools/arena-layout-selected';

const isBrowser = typeof window !== 'undefined';

const randomLayoutId = () => `layout-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const normalizeGrid = (grid: unknown): (string | null)[][] => {
  if (!Array.isArray(grid)) return [];
  return grid.map((row) => {
    if (!Array.isArray(row)) return [];
    return row.map((cell) => {
      if (cell === null || cell === undefined) return null;
      const value = String(cell).trim();
      return value === '' ? null : value;
    });
  });
};

const normalizeRowLabels = (labels: unknown, length: number): (string | null)[] | undefined => {
  if (!Array.isArray(labels)) return undefined;
  const result: (string | null)[] = [];
  for (let index = 0; index < length; index += 1) {
    if (index >= labels.length) {
      result.push(null);
      continue;
    }
    const label = labels[index];
    if (label === null || label === undefined) {
      result.push(null);
      continue;
    }
    const value = String(label).trim();
    result.push(value === '' ? null : value);
  }
  if (!result.some((label) => label)) return undefined;
  return result;
};

const coerceSection = (section: any, layoutId: string, index: number): ArenaLayoutSectionDocument => {
  const fallbackId = `${layoutId}-section-${index + 1}`;
  const id = typeof section?.id === 'string' && section.id.trim() ? section.id.trim() : fallbackId;
  const grid = normalizeGrid(section?.grid ?? section?.rows);
  const rowLabels = normalizeRowLabels(section?.rowLabels ?? section?.labels, grid.length);
  return {
    id,
    title: typeof section?.title === 'string' ? section.title : undefined,
    seatSize: typeof section?.seatSize === 'number' ? section.seatSize : undefined,
    gapSize: typeof section?.gapSize === 'number' ? section.gapSize : undefined,
    grid,
    rowLabels,
    meta: typeof section?.meta === 'object' && section?.meta !== null ? section.meta : undefined,
  };
};

const coerceLayout = (source: any, fallbackId?: string): ArenaLayoutDocument | null => {
  if (!source || typeof source !== 'object') return null;
  const rawId = typeof source.id === 'string' && source.id.trim() ? source.id.trim() : undefined;
  const id = rawId ?? fallbackId ?? randomLayoutId();
  const name = typeof source.name === 'string' && source.name.trim() ? source.name : id;
  let sections: ArenaLayoutSectionDocument[] = [];
  if (Array.isArray(source.sections) && source.sections.length) {
    sections = source.sections.map((section: any, index: number) => coerceSection(section, id, index));
  } else if (Array.isArray(source.grid)) {
    const grid = normalizeGrid(source.grid);
    if (grid.length) {
      sections = [coerceSection({
        id: `${id}-section-1`,
        title: typeof source.sectionTitle === 'string' ? source.sectionTitle : undefined,
        grid,
        rowLabels: source.rowLabels,
        seatSize: source.seatSize,
        gapSize: source.gapSize,
      }, id, 0)];
    }
  }
  sections = sections.filter((section) => section.grid.length && section.grid.some((row) => row.length));
  if (!sections.length) return null;
  return {
    id,
    name,
    description: typeof source.description === 'string' ? source.description : undefined,
    seatKey: typeof source.seatKey === 'string' ? source.seatKey : undefined,
    normalize: typeof source.normalize === 'string' ? source.normalize : undefined,
    default: source.default === true,
    sections,
    meta: typeof source.meta === 'object' && source.meta !== null ? source.meta : undefined,
  };
};

const parseLayouts = (input: unknown): ArenaLayoutDocument[] => {
  const map = new Map<string, ArenaLayoutDocument>();
  const pushLayout = (candidate: ArenaLayoutDocument | null) => {
    if (!candidate) return;
    map.set(candidate.id, candidate);
  };
  if (Array.isArray(input)) {
    input.forEach((item, index) => {
      pushLayout(coerceLayout(item, `layout-${index + 1}`));
    });
  } else {
    pushLayout(coerceLayout(input, undefined));
  }
  return Array.from(map.values());
};

const loadLayoutsFromStorage = (): ArenaLayoutDocument[] => {
  if (!isBrowser) return [];
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parseLayouts(parsed);
  } catch (error) {
    console.warn('Failed to parse stored arena layouts:', error);
    return [];
  }
};

const pickPrimaryMonitor = (monitors: MonitorRecord[]): MonitorRecord | null => {
  if (!monitors?.length) return null;
  return monitors.reduce<MonitorRecord | null>((best, candidate) => {
    if (!best) return candidate;
    const bestTime = best.updateAt ?? 0;
    const candidateTime = candidate.updateAt ?? 0;
    if (candidateTime > bestTime) return candidate;
    return best;
  }, null);
};

const formatUptime = (uptime?: number): string => {
  if (!uptime) return 'Unknown';
  return new Date(uptime * 1000).toISOString().substring(11, 19);
};

const formatWifiSignalLabel = (signal?: number): string => {
  if (signal === undefined || signal === null || Number.isNaN(signal)) return 'No Data';
  return `${Math.round(signal)} dBm`;
};

const formatMac = (mac?: string): string => {
  if (!mac) return 'Unknown';
  if (mac.includes(':')) return mac;
  const parts = mac.match(/.{1,2}/g);
  return parts ? parts.join(':') : mac;
};

interface ArenaViewProps {
  monitors: MonitorRecord[];
  isLoading?: boolean;
  openMonitorInfo: (monitor: MonitorRecord, tab?: string) => void;
}

export function ArenaView({ monitors, isLoading, openMonitorInfo }: ArenaViewProps) {
  const theme = useMantineTheme();
  const monospaceFont = theme.fontFamilyMonospace ?? 'monospace';
  const [viewMode, setViewMode] = React.useState<ArenaViewMode>('signal');
  const [selectedLayoutId, setSelectedLayoutId] = React.useState<string | null>(() => {
    if (!isBrowser) return null;
    const stored = window.localStorage.getItem(DEFAULT_LAYOUT_KEY);
    if (stored) return stored;
    const existing = loadLayoutsFromStorage();
    return existing[0]?.id ?? null;
  });
  const [zoom, setZoom] = React.useState(0.40);
  const [layouts, setLayouts] = React.useState<ArenaLayoutDocument[]>(() => loadLayoutsFromStorage());

  React.useEffect(() => {
    if (!isBrowser) return;
    if (!layouts.length) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layouts));
  }, [layouts]);

  React.useEffect(() => {
    if (!isBrowser) return;
    if (selectedLayoutId) {
      window.localStorage.setItem(DEFAULT_LAYOUT_KEY, selectedLayoutId);
    } else {
      window.localStorage.removeItem(DEFAULT_LAYOUT_KEY);
    }
  }, [selectedLayoutId]);

  React.useEffect(() => {
    if (!layouts.length) {
      if (selectedLayoutId !== null) setSelectedLayoutId(null);
      return;
    }
    if (!selectedLayoutId || !layouts.some((item) => item.id === selectedLayoutId)) {
      setSelectedLayoutId(layouts[0].id);
    }
  }, [layouts, selectedLayoutId]);

  const updateZoom = React.useCallback((delta: number) => {
    setZoom((current) => {
      const next = Number((current + delta).toFixed(2));
      return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
    });
  }, []);

  const resetZoom = React.useCallback(() => {
    setZoom(1);
  }, []);

  const layout = React.useMemo(
    () => layouts.find((item) => item.id === selectedLayoutId) ?? null,
    [layouts, selectedLayoutId],
  );

  const normalizeSeatId = React.useMemo(() => {
    if (!layout?.normalize) return defaultNormalize;
    const key = String(layout.normalize).toLowerCase();
    return normalizers[key] ?? defaultNormalize;
  }, [layout]);

  const definedSeatIds = React.useMemo(() => {
    const ids = new Set<string>();
    if (!layout) return ids;
    for (const section of layout.sections ?? []) {
      for (const row of section.grid ?? []) {
        for (const seatId of row) {
          if (seatId) ids.add(normalizeSeatId(seatId));
        }
      }
    }
    return ids;
  }, [layout, normalizeSeatId]);

  const { seatMap, overflow } = React.useMemo(() => {
    const seatMap = new Map<string, MonitorRecord[]>();
    const overflow: MonitorRecord[] = [];
    if (!monitors?.length) {
      return { seatMap, overflow };
    }
    if (!layout || !layout.sections?.length) {
      return { seatMap, overflow: [...monitors] };
    }
    for (const monitor of monitors) {
      const rawSeat = getMonitorSeatId(monitor, layout);
      if (!rawSeat) {
        overflow.push(monitor);
        continue;
      }
      const normalized = normalizeSeatId(String(rawSeat));
      if (!normalized || !definedSeatIds.has(normalized)) {
        overflow.push(monitor);
        continue;
      }
      const list = seatMap.get(normalized);
      if (!list) {
        seatMap.set(normalized, [monitor]);
      } else {
        list.push(monitor);
      }
    }
    return { seatMap, overflow };
  }, [definedSeatIds, layout, monitors, normalizeSeatId]);

  const handleImportLayouts = React.useCallback(async (file: File | null) => {
    if (!file) return;
    try {
      const text = await file.text();
      const parsedRaw = JSON.parse(text) as unknown;
      const imported = parseLayouts(parsedRaw);
      if (!imported.length) {
        notifications.show({ title: 'Import skipped', message: 'No valid layouts were found in the JSON file.', color: 'yellow' });
        return;
      }
      setLayouts((prev) => {
        const merged = [...prev];
        imported.forEach((layoutDoc) => {
          const index = merged.findIndex((item) => item.id === layoutDoc.id);
          if (index === -1) {
            merged.push(layoutDoc);
          } else {
            merged[index] = layoutDoc;
          }
        });
        return merged;
      });
      const preferred = imported.find((item) => item.default) ?? imported[0];
      if (preferred) {
        setSelectedLayoutId((current) => {
          if (current && imported.some((item) => item.id === current)) return current;
          return preferred.id;
        });
      }
      notifications.show({
        title: 'Layouts imported',
        message: `Loaded ${imported.length} layout${imported.length > 1 ? 's' : ''} from ${file.name}.`,
        color: 'green',
      });
    } catch (error) {
      console.error('Failed to import arena layouts', error);
      const message = error instanceof Error ? error.message : 'Invalid JSON file.';
      notifications.show({ title: 'Import failed', message, color: 'red' });
    }
  }, []);

  const handleClearLayouts = React.useCallback(() => {
    setLayouts([]);
    setSelectedLayoutId(null);
    if (isBrowser) {
      window.localStorage.removeItem(STORAGE_KEY);
      window.localStorage.removeItem(DEFAULT_LAYOUT_KEY);
    }
    notifications.show({ title: 'Layouts cleared', message: 'Arena layouts were removed from this browser.', color: 'orange' });
  }, []);

  const unmatchedMonitors = overflow;

  const getSeatStatusColor = (seatId: string): { color: string; monitor: MonitorRecord | null; monitors: MonitorRecord[] } => {
    const monitorsForSeat = seatMap.get(normalizeSeatId(seatId)) ?? [];
    const monitor = pickPrimaryMonitor(monitorsForSeat);
    if (!monitor) {
      return { color: theme.colors.gray[3], monitor: null, monitors: monitorsForSeat };
    }
    const online = !!monitor.updateAt && monitor.updateAt > Date.now() - ONLINE_THRESHOLD_MS;
    if (!online) {
      return { color: theme.colors.gray[5], monitor, monitors: monitorsForSeat };
    }
    if (viewMode === 'status') {
      return { color: theme.colors.green[6], monitor, monitors: monitorsForSeat };
    }
    if (viewMode === 'bssid') {
      if (!monitor.wifiBssid) {
        return { color: theme.colors.blue[3], monitor, monitors: monitorsForSeat };
      }
      return { color: hashToColor(monitor.wifiBssid), monitor, monitors: monitorsForSeat };
    }
    const signal = monitor.wifiSignal ?? Number.NaN;
    return { color: getSignalColor(signal, theme.colors.yellow[4]), monitor, monitors: monitorsForSeat };
  };

  const renderSeatCard = (
    seatId: string,
    section: ArenaLayoutSectionDocument,
    rowIndex: number,
    cellIndex: number,
    seatWidth: number,
    seatHeight: number,
  ) => {
    const { color, monitor, monitors: monitorsForSeat } = getSeatStatusColor(seatId);
    const duplicatesCount = monitorsForSeat.length > 1 ? monitorsForSeat.length : null;
    const tooltipContent = (
      <Stack gap={4}>
        <Text fw={600} size="sm">
          {seatId}
        </Text>
        {monitor ? (
          <>
            <Text size="sm">Machine: {monitor.name ?? monitor.hostname ?? 'Unnamed'}</Text>
            <Text size="sm">IP: {monitor.ip ?? 'Unknown'}</Text>
            <Text size="sm">MAC: {formatMac(monitor.mac)}</Text>
            <Text size="sm">Online: {monitor.updateAt && monitor.updateAt > Date.now() - ONLINE_THRESHOLD_MS ? 'Yes' : 'No'}</Text>
            <Text size="sm">Uptime: {formatUptime(monitor.uptime)}</Text>
            <Text size="sm">Version: {monitor.version ?? 'Unknown'}</Text>
            <Group gap={6}>
              <ThemeIcon size="sm" color="blue" variant="light"><IconWifi size={14} /></ThemeIcon>
              <Text size="sm">{formatWifiSignalLabel(monitor.wifiSignal)}</Text>
            </Group>
            <Group gap={6}>
              <ThemeIcon size="sm" color="grape" variant="light"><IconRouter size={14} /></ThemeIcon>
              <Text size="sm">{monitor.wifiBssid ?? 'None'}</Text>
            </Group>
            {monitorsForSeat.length > 1 && (
              <Text size="sm" c="orange">
                Duplicate Reports: {monitorsForSeat.map((item) => item.name ?? item._id).join(', ')}
              </Text>
            )}
          </>
        ) : (
          <Text size="sm">No monitor data</Text>
        )}
      </Stack>
    );

    const handleSeatClick = () => {
      if (monitor) {
        openMonitorInfo(monitor, 'info');
      }
    };

    const cellKey = `${section.id}-${rowIndex}-${cellIndex}-${normalizeSeatId(seatId)}`;
    const badgeOffset = Math.max(4, 4 * zoom);

    return (
      <Tooltip key={cellKey} label={tooltipContent} position="top" withArrow>
        <Card
          padding={Math.max(2, 4 * zoom)}
          shadow="sm"
          radius="sm"
          onClick={handleSeatClick}
          style={{
            width: seatWidth,
            height: seatHeight,
            cursor: monitor ? 'pointer' : 'default',
            backgroundColor: color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            userSelect: 'none',
            flex: '0 0 auto',
          }}
        >
          <Text
            fw={600}
            size="sm"
            c="white"
            style={{
              textShadow: '0 0 4px rgba(0,0,0,0.5)',
              fontFamily: monospaceFont,
            }}
          >
            {seatId}
          </Text>
          {duplicatesCount && (
            <Badge
              size="xs"
              color="yellow"
              variant="filled"
              style={{ position: 'absolute', top: badgeOffset, right: badgeOffset }}
            >
              x{duplicatesCount}
            </Badge>
          )}
        </Card>
      </Tooltip>
    );
  };

  const renderLegend = () => {
    if (viewMode === 'status') {
      return (
        <Group gap="sm">
          <Group gap={6}>
            <Box style={{
              width: 16, height: 16, backgroundColor: theme.colors.green[6], borderRadius: 3,
            }} />
            <Text size="sm">Online</Text>
          </Group>
          <Group gap={6}>
            <Box style={{
              width: 16, height: 16, backgroundColor: theme.colors.gray[5], borderRadius: 3,
            }} />
            <Text size="sm">Offline</Text>
          </Group>
          <Group gap={6}>
            <Box style={{
              width: 16, height: 16, backgroundColor: theme.colors.gray[3], borderRadius: 3,
            }} />
            <Text size="sm">Unmatched</Text>
          </Group>
        </Group>
      );
    }
    if (viewMode === 'bssid') {
      return <Text size="sm">Same color indicates the same BSSID. Offline hosts appear gray.</Text>;
    }
    return (
      <Group gap="xs" align="center">
        <Text size="sm">Signal Strength</Text>
        <Box
          style={{
            width: 120,
            height: 12,
            borderRadius: 6,
            background: 'linear-gradient(90deg, hsl(0,80%,45%) 0%, hsl(120,80%,45%) 100%)',
          }}
        />
        <Text size="xs" c="dimmed">Poor</Text>
        <Text size="xs" c="dimmed">Excellent</Text>
      </Group>
    );
  };

  const renderSection = () => {
    if (!layouts.length) {
      return (
        <Alert icon={<IconAlertTriangle size={16} />} color="orange" variant="light" title="No Layouts Loaded">
          <Text size="sm">Use the Import JSON button to load a seat map. Imported layouts are saved in this browser&apos;s local storage.</Text>
        </Alert>
      );
    }
    if (!layout) {
      return (
        <Alert icon={<IconAlertTriangle size={16} />} color="blue" variant="light" title="Choose A Layout">
          <Text size="sm">Select a layout from the dropdown. You can import additional layouts at any time.</Text>
        </Alert>
      );
    }
    if (!layout.sections?.length) {
      return (
        <Alert icon={<IconAlertTriangle size={16} />} color="orange" variant="light" title="Layout Is Empty">
          <Text size="sm">The current layout contains no sections. Double-check the JSON file to ensure it includes a two-dimensional grid.</Text>
        </Alert>
      );
    }

    return (
      <>
        {layout.sections.map((section) => {
          const gapSize = (section.gapSize ?? 8) * zoom;
          const seatHeight = (section.seatSize ?? 36) * zoom;
          const seatWidth = seatHeight * SEAT_ASPECT_RATIO;
          return (
            <Stack key={section.id} gap="xs">
              {section.title && <Title order={5}>{section.title}</Title>}
              <Stack gap={gapSize}>
                {section.grid.map((row, rowIndex) => {
                  const label = section.rowLabels?.[rowIndex] ?? null;
                  return (
                    <Group key={`${section.id}-row-${rowIndex}`} gap={gapSize} wrap="nowrap" align="center">
                      {label ? (
                        <Box
                          style={{
                            width: seatWidth,
                            minWidth: seatWidth,
                            height: seatHeight,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'flex-end',
                            paddingRight: Math.max(2, 4 * zoom),
                            color: theme.colors.gray[7],
                            fontSize: theme.fontSizes.sm,
                            flex: '0 0 auto',
                            fontFamily: monospaceFont,
                          }}
                        >
                          {label}
                        </Box>
                      ) : null}
                      {row.map((value, cellIndex) => {
                        if (!value) {
                          return (
                            <Box
                              key={`${section.id}-${rowIndex}-${cellIndex}-gap`}
                              style={{ width: seatWidth, height: seatHeight, flex: '0 0 auto' }}
                            />
                          );
                        }
                        return renderSeatCard(value, section, rowIndex, cellIndex, seatWidth, seatHeight);
                      })}
                    </Group>
                  );
                })}
              </Stack>
            </Stack>
          );
        })}
      </>
    );
  };

  return (
    <Card padding="md" withBorder radius="md" pos="relative">
      <LoadingOverlay
        visible={Boolean(isLoading)}
        zIndex={100}
        overlayProps={{ radius: 'sm', blur: 2 }}
      />
      <Stack gap="md">
        <Group justify="space-between" align="center">
          <Group gap="sm">
            <Select
              label="Layout"
              placeholder="Import an arena layout JSON"
              value={selectedLayoutId}
              onChange={(value) => setSelectedLayoutId(value)}
              data={layouts.map((item) => ({ value: item.id, label: item.name }))}
              disabled={!layouts.length}
              style={{ width: 220 }}
            />
            <SegmentedControl
              value={viewMode}
              onChange={(value: string) => setViewMode(value as ArenaViewMode)}
              data={viewModeOptions}
            />
            <Group gap={6} align="center">
              <Text size="sm">Zoom</Text>
              <Group gap={4} align="center">
                <ActionIcon
                  variant="light"
                  aria-label="Zoom out"
                  onClick={() => updateZoom(-ZOOM_STEP)}
                  disabled={zoom <= MIN_ZOOM}
                >
                  <IconZoomOut size={16} />
                </ActionIcon>
                <ActionIcon
                  variant="light"
                  aria-label="Reset zoom"
                  onClick={resetZoom}
                  disabled={zoom === 1}
                >
                  <IconZoomReset size={16} />
                </ActionIcon>
                <ActionIcon
                  variant="light"
                  aria-label="Zoom in"
                  onClick={() => updateZoom(ZOOM_STEP)}
                  disabled={zoom >= MAX_ZOOM}
                >
                  <IconZoomIn size={16} />
                </ActionIcon>
              </Group>
              <Text size="sm" c="dimmed">{Math.round(zoom * 100)}%</Text>
            </Group>
            <Group gap="xs">
              <FileButton onChange={handleImportLayouts} accept="application/json">
                {(fileProps) => (
                  <Button
                    {...fileProps}
                    variant="light"
                    leftSection={<IconUpload size={16} />}
                  >
                    Import JSON
                  </Button>
                )}
              </FileButton>
              <Button
                variant="light"
                color="red"
                leftSection={<IconTrash size={16} />}
                onClick={handleClearLayouts}
                disabled={!layouts.length}
              >
                Clear Layouts
              </Button>
            </Group>
          </Group>
          {renderLegend()}
        </Group>
        {layout?.description && (
          <Alert color="blue" variant="light" title={layout.name} icon={<IconInfoCircle size={16} />}>
            <Text size="sm">{layout.description}</Text>
          </Alert>
        )}
        <ScrollArea h="65vh" type="scroll">
          <Stack gap="lg" pr="md">
            {renderSection()}
          </Stack>
        </ScrollArea>
        {layout && unmatchedMonitors.length > 0 && (
          <Alert icon={<IconAlertTriangle size={16} />} color="red" variant="light" title="Unmatched Machines">
            <Text size="sm">
              The following machines do not map to the current layout: {unmatchedMonitors.map((m) => m.name ?? m.hostname ?? m._id).join(', ')}
            </Text>
          </Alert>
        )}
      </Stack>
    </Card>
  );
}
