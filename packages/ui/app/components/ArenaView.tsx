import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Card,
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
import {
  IconAlertTriangle,
  IconEdit,
  IconInfoCircle,
  IconRouter,
  IconWifi,
  IconZoomIn,
  IconZoomOut,
  IconZoomReset,
} from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { parseArenaLayouts } from '../arena/layouts';
import type {
  ArenaLayoutDocument, ArenaLayoutSectionDocument, ArenaLayoutsResponse,
} from '../arena/types';
import { arenaLayoutsQuery } from '../queries';
import { ArenaLayoutEditor } from './ArenaLayoutEditor';

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

const getMonitorSeatCandidates = (
  monitor: MonitorRecord,
  layout: ArenaLayoutDocument | null,
): string[] => {
  const candidates: unknown[] = [];
  if (layout?.seatKey) {
    const path = layout.seatKey.split('.');
    let value: any = monitor;
    for (const key of path) {
      if (value == null) break;
      value = value[key as keyof typeof value];
    }
    candidates.push(value);
  }
  candidates.push(monitor.name, monitor.hostname);
  return Array.from(new Set(candidates
    .filter((value) => value !== undefined && value !== null && String(value).trim())
    .map(String)));
};

const getSignalColor = (signal: number, fallback: string): string => {
  if (Number.isNaN(signal)) return fallback;
  const clamped = Math.max(-90, Math.min(-35, signal));
  const ratio = (clamped + 90) / 55;
  const hue = 120 * ratio;
  return `hsl(${Math.round(hue)}, 80%, 45%)`;
};

const generateDistinctColors = (count: number): string[] => {
  if (count === 0) return [];
  if (count === 1) return ['hsl(200, 80%, 45%)'];
  const colors: string[] = [];
  const hueStep = 360 / count;
  for (let i = 0; i < count; i += 1) {
    const hue = (i * hueStep) % 360;
    const saturation = 70 + (i % 3) * 5;
    const lightness = 40 + (i % 4) * 3;
    colors.push(`hsl(${Math.round(hue)}, ${saturation}%, ${lightness}%)`);
  }
  return colors;
};

type ArenaViewMode = 'signal' | 'bssid' | 'status';

const viewModeOptions: { value: ArenaViewMode; label: string }[] = [
  { value: 'signal', label: 'Signal Quality' },
  { value: 'bssid', label: 'BSSID' },
  { value: 'status', label: 'Online Status' },
];

const getViewModeFromQuery = (params: URLSearchParams): ArenaViewMode => {
  const mode = params.get('mode');
  if (mode === 'bssid' || mode === 'status' || mode === 'signal') return mode;
  return 'signal';
};

const defaultNormalize = (value: string): string => value.trim().toUpperCase();

const normalizers: Record<string, (value: string) => string> = {
  none: (value: string) => value,
  upper: (value: string) => value.toUpperCase(),
  lower: (value: string) => value.toLowerCase(),
  trim: (value: string) => value.trim(),
  'trim-upper': defaultNormalize,
  // Layout files use kebab-case normalization identifiers.
  // eslint-disable-next-line @typescript-eslint/naming-convention
  'trim-lower': (value: string) => value.trim().toLowerCase(),
};

const DEFAULT_LAYOUT_KEY = 'xcpc-tools/arena-layout-selected';

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
  openMonitorInfo?: (monitor: MonitorRecord, tab?: string) => void;
}

export const ArenaView = React.memo(({ monitors, isLoading, openMonitorInfo }: ArenaViewProps) => {
  const theme = useMantineTheme();
  const queryClient = useQueryClient();
  const monospaceFont = theme.fontFamilyMonospace ?? 'monospace';
  const [searchParams, setSearchParams] = useSearchParams();
  const legacyMode = new URLSearchParams(window.location.search).get('mode');
  const effectiveSearchParams = React.useMemo(() => {
    if (searchParams.has('mode') || !legacyMode) return searchParams;
    const next = new URLSearchParams(searchParams);
    next.set('mode', legacyMode);
    return next;
  }, [legacyMode, searchParams]);
  const viewMode = getViewModeFromQuery(effectiveSearchParams);
  const [editorOpened, setEditorOpened] = React.useState(false);
  const layoutsQuery = useQuery({ ...arenaLayoutsQuery(), enabled: editorOpened });
  const [layouts, setLayouts] = React.useState<ArenaLayoutDocument[]>(() => (
    parseArenaLayouts(window.Context.arenaLayouts)
  ));
  const editorLayouts = React.useMemo(
    () => parseArenaLayouts(layoutsQuery.data?.layouts ?? []),
    [layoutsQuery.data?.layouts],
  );
  const [selectedLayoutId, setSelectedLayoutId] = React.useState<string | null>(() => (
    window.localStorage.getItem(DEFAULT_LAYOUT_KEY)
  ));
  const [zoom, setZoom] = React.useState(0.40);
  const bssidColorRegistry = React.useRef(new Map<string, string>());

  React.useEffect(() => {
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
      setSelectedLayoutId(layouts.find((item) => item.default)?.id ?? layouts[0].id);
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

  const handleLayoutsSaved = React.useCallback((response: ArenaLayoutsResponse) => {
    queryClient.setQueryData(['arena-layouts'], response);
    const nextLayouts = parseArenaLayouts(response.layouts);
    window.Context.arenaLayouts = response.layouts;
    setLayouts(nextLayouts);
    if (!nextLayouts.some((item) => item.id === selectedLayoutId)) {
      setSelectedLayoutId(nextLayouts.find((item) => item.default)?.id ?? nextLayouts[0]?.id ?? null);
    }
  }, [queryClient, selectedLayoutId]);

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
    const mappedSeats = new Map<string, MonitorRecord[]>();
    const overflowMonitors: MonitorRecord[] = [];
    if (!monitors?.length) {
      return { seatMap: mappedSeats, overflow: overflowMonitors };
    }
    if (!layout || !layout.sections?.length) {
      return { seatMap: mappedSeats, overflow: [...monitors] };
    }
    for (const monitor of monitors) {
      const matchedSeat = getMonitorSeatCandidates(monitor, layout)
        .map((candidate) => normalizeSeatId(candidate))
        .find((candidate) => definedSeatIds.has(candidate));
      if (!matchedSeat) {
        overflowMonitors.push(monitor);
        continue;
      }
      const list = mappedSeats.get(matchedSeat);
      if (!list) {
        mappedSeats.set(matchedSeat, [monitor]);
      } else {
        list.push(monitor);
      }
    }
    return { seatMap: mappedSeats, overflow: overflowMonitors };
  }, [definedSeatIds, layout, monitors, normalizeSeatId]);

  const bssidColorMap = React.useMemo(() => {
    if (viewMode !== 'bssid') return new Map<string, string>();
    const uniqueBssids = new Set<string>();
    for (const monitor of monitors) {
      if (monitor.wifiBssid && monitor.updateAt && monitor.updateAt > Date.now() - ONLINE_THRESHOLD_MS) {
        uniqueBssids.add(monitor.wifiBssid);
      }
    }
    const bssidArray = Array.from(uniqueBssids).sort();
    for (const knownBssid of bssidColorRegistry.current.keys()) {
      if (!uniqueBssids.has(knownBssid)) bssidColorRegistry.current.delete(knownBssid);
    }
    const colors = generateDistinctColors(Math.max(12, bssidArray.length));
    const usedColors = new Set(bssidColorRegistry.current.values());
    const map = new Map<string, string>();
    bssidArray.forEach((bssid) => {
      let color = bssidColorRegistry.current.get(bssid);
      if (!color) {
        color = colors.find((candidate) => !usedColors.has(candidate)) || colors[bssidColorRegistry.current.size % colors.length];
        bssidColorRegistry.current.set(bssid, color);
        usedColors.add(color);
      }
      map.set(bssid, color);
    });
    return map;
  }, [monitors, viewMode]);

  const unmatchedMonitors = overflow;

  const getSeatStatusColor = (seatId: string): { color: string; monitor: MonitorRecord | null; monitors: MonitorRecord[] } => {
    const monitorsForSeat = seatMap.get(normalizeSeatId(seatId)) ?? [];
    const monitor = pickPrimaryMonitor(monitorsForSeat);
    if (!monitor) {
      return { color: theme.colors.gray[3], monitor: null, monitors: monitorsForSeat };
    }
    const online = !!monitor.updateAt && monitor.updateAt > Date.now() - ONLINE_THRESHOLD_MS;
    const isErrmachine = !online;
    if (isErrmachine) {
      if (viewMode === 'status') {
        return { color: theme.colors.red[6], monitor, monitors: monitorsForSeat };
      }
      return { color: theme.colors.gray[5], monitor, monitors: monitorsForSeat };
    }
    if (viewMode === 'status') {
      return { color: theme.colors.green[6], monitor, monitors: monitorsForSeat };
    }
    if (viewMode === 'bssid') {
      if (!monitor.wifiBssid) {
        return { color: theme.colors.blue[3], monitor, monitors: monitorsForSeat };
      }
      const color = bssidColorMap.get(monitor.wifiBssid);
      if (color) {
        return { color, monitor, monitors: monitorsForSeat };
      }
      return { color: theme.colors.blue[3], monitor, monitors: monitorsForSeat };
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
      if (monitor && openMonitorInfo) {
        openMonitorInfo(monitor, 'info');
      }
    };

    const cellKey = `${section.id}-${rowIndex}-${cellIndex}-${normalizeSeatId(seatId)}`;
    const badgeOffset = Math.max(4, 4 * zoom);
    const seatPadding = Math.max(2, 4 * zoom);
    const seatTextWidth = Array.from(seatId).reduce(
      (width, character) => width + ((character.codePointAt(0) || 0) > 0xff ? 1 : 0.62),
      0,
    );
    const seatFontSize = Math.max(1, Math.min(
      14,
      seatHeight - seatPadding * 2,
      (seatWidth - seatPadding * 2) / Math.max(seatTextWidth, 1),
    ));

    return (
      <Tooltip key={cellKey} label={tooltipContent} position="top" withArrow>
        <Card
          padding={seatPadding}
          shadow="sm"
          radius="sm"
          onClick={handleSeatClick}
          style={{
            width: seatWidth,
            height: seatHeight,
            cursor: monitor && openMonitorInfo ? 'pointer' : 'default',
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
            c="white"
            style={{
              textShadow: '0 0 4px rgba(0,0,0,0.5)',
              fontFamily: monospaceFont,
              fontSize: seatFontSize,
              lineHeight: 1,
              whiteSpace: 'nowrap',
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
              width: 16, height: 16, backgroundColor: theme.colors.red[6], borderRadius: 3,
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
        <Text size="xs" c="dimmed">Poor</Text>
        <Box
          style={{
            width: 120,
            height: 12,
            borderRadius: 6,
            background: 'linear-gradient(90deg, hsl(0,80%,45%) 0%, hsl(120,80%,45%) 100%)',
          }}
        />
        <Text size="xs" c="dimmed">Excellent</Text>
      </Group>
    );
  };

  const renderSection = () => {
    if (!layouts.length) {
      return (
        <Alert icon={<IconAlertTriangle size={16} />} color="orange" variant="light" title="No Layouts Configured">
          <Text size="sm">Create the first layout with the arena layout editor.</Text>
        </Alert>
      );
    }
    if (!layout) {
      return (
        <Alert icon={<IconAlertTriangle size={16} />} color="blue" variant="light" title="Choose A Layout">
          <Text size="sm">Select a layout from the dropdown.</Text>
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
    <Box
      pos="relative"
      style={{ display: 'flex', flex: 1, minHeight: 0, flexDirection: 'column' }}
    >
      <LoadingOverlay
        visible={Boolean(isLoading)}
        zIndex={100}
        overlayProps={{ radius: 'sm', blur: 2 }}
      />
      <Stack gap="md" style={{ flex: 1, minHeight: 0 }}>
        <Group justify="space-between" align="center" wrap="wrap">
          <Group gap="sm" align="center" wrap="wrap">
            <Select
              size="sm"
              aria-label="Layout"
              placeholder="Select layout"
              value={selectedLayoutId}
              onChange={(value) => setSelectedLayoutId(value)}
              data={layouts.map((item) => ({ value: item.id, label: item.name }))}
              disabled={!layouts.length}
              style={{ width: 180, maxWidth: '100%' }}
            />
            <SegmentedControl
              value={viewMode}
              onChange={(value: string) => {
                const nextParams = new URLSearchParams(searchParams);
                nextParams.set('mode', value as ArenaViewMode);
                setSearchParams(nextParams, { replace: true });
              }}
              data={viewModeOptions}
            />
            <Group gap={6} align="center">
              <Text size="sm">Zoom</Text>
              <Group gap={4} align="center">
                <ActionIcon
                  size="sm"
                  variant="light"
                  aria-label="Zoom out"
                  onClick={() => updateZoom(-ZOOM_STEP)}
                  disabled={zoom <= MIN_ZOOM}
                >
                  <IconZoomOut size={16} />
                </ActionIcon>
                <ActionIcon
                  size="sm"
                  variant="light"
                  aria-label="Reset zoom"
                  onClick={resetZoom}
                  disabled={zoom === 1}
                >
                  <IconZoomReset size={16} />
                </ActionIcon>
                <ActionIcon
                  size="sm"
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
          </Group>
          <Group gap="sm" align="center" wrap="wrap">
            {renderLegend()}
            <Button
              size="xs"
              variant="light"
              leftSection={<IconEdit size={16} />}
              onClick={() => setEditorOpened(true)}
              loading={editorOpened && layoutsQuery.isFetching}
            >
              Edit layouts
            </Button>
          </Group>
        </Group>
        {layout?.description && (
          <Alert color="blue" variant="light" title={layout.name} icon={<IconInfoCircle size={16} />}>
            <Text size="sm">{layout.description}</Text>
          </Alert>
        )}
        <ScrollArea type="scroll" style={{ flex: 1, minHeight: 0 }}>
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
      <ArenaLayoutEditor
        opened={editorOpened && Boolean(layoutsQuery.data)}
        onClose={() => setEditorOpened(false)}
        layouts={editorLayouts}
        selectedLayoutId={selectedLayoutId}
        revision={layoutsQuery.data?.revision || ''}
        onSaved={handleLayoutsSaved}
        onConflict={() => layoutsQuery.refetch()}
      />
    </Box>
  );
});
