import {
  ActionIcon,
  Alert,
  Badge,
  Box,
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
  IconRouter,
  IconWifi,
  IconZoomIn,
  IconZoomOut,
  IconZoomReset,
} from '@tabler/icons-react';
import React from 'react';
import { arenaLayouts, defaultArenaLayoutId } from '../arena/nuaa2025.layout';
import type { ArenaCell, ArenaLayoutConfig, ArenaSeatCell } from '../arena/types';

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
  layout: ArenaLayoutConfig | null,
): string | null => {
  if (!monitor) return null;
  if (layout?.resolveMonitorSeat) {
    const resolved = layout.resolveMonitorSeat(monitor);
    return resolved ? String(resolved) : null;
  }
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
  const [viewMode, setViewMode] = React.useState<ArenaViewMode>('signal');
  const [selectedLayoutId, setSelectedLayoutId] = React.useState<string | null>(defaultArenaLayoutId);
  const [zoom, setZoom] = React.useState(0.40);

  const updateZoom = React.useCallback((delta: number) => {
    setZoom((current) => {
      const next = Number((current + delta).toFixed(2));
      return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
    });
  }, []);

  const resetZoom = React.useCallback(() => {
    setZoom(1);
  }, []);

  const layout = React.useMemo(() => arenaLayouts.find((item) => item.id === selectedLayoutId) ?? null, [selectedLayoutId]);

  const normalizeSeatId = layout?.normalizeSeatId ?? defaultNormalize;

  const definedSeatIds = React.useMemo(() => {
    const ids = new Set<string>();
    if (!layout) return ids;
    for (const section of layout.sections) {
      for (const row of section.rows) {
        for (const cell of row) {
          if (cell.type === 'seat') {
            ids.add(normalizeSeatId(cell.seatId));
          }
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
    if (!layout || !layout.sections.length) {
      return { seatMap, overflow: [...monitors] };
    }
    for (const monitor of monitors) {
      const rawSeat = getMonitorSeatId(monitor, layout);
      if (!rawSeat) {
        overflow.push(monitor);
        continue;
      }
      const normalized = normalizeSeatId(String(rawSeat));
      if (!normalized) {
        overflow.push(monitor);
        continue;
      }
      if (!definedSeatIds.has(normalized)) {
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

  const unmatchedMonitors = overflow;

  const getSeatStatusColor = (seat: ArenaSeatCell): { color: string; monitor: MonitorRecord | null; monitors: MonitorRecord[] } => {
    const monitorsForSeat = seatMap.get(normalizeSeatId(seat.seatId)) ?? [];
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

  const renderCell = (
    cell: ArenaCell,
    section: ArenaLayoutConfig['sections'][number],
    rowIndex: number,
    cellIndex: number,
  ) => {
    const baseSeatSize = section.seatSize ?? 36;
    const baseGapSize = section.gapSize ?? 8;
    const height = baseSeatSize * zoom;
    const gapSize = baseGapSize * zoom;
    const span = cell.span ?? 1;
    const seatWidth = height * SEAT_ASPECT_RATIO;
    const width = seatWidth * span + gapSize * (span - 1);
    const keySuffix = cell.type === 'seat'
      ? normalizeSeatId(cell.seatId)
      : cell.type === 'label'
        ? cell.label
        : 'gap';
    const cellKey = `${section.id}-${rowIndex}-${cellIndex}-${keySuffix}`;

    if (cell.type === 'gap') {
  return <Box key={cellKey} style={{ width, height, flex: '0 0 auto' }} />;
    }

    if (cell.type === 'label') {
      return (
        <Box
          key={cellKey}
          style={{
            width,
            height,
            display: 'flex',
            alignItems: 'center',
            justifyContent: cell.align ?? 'flex-end',
            paddingRight: Math.max(2, 4 * zoom),
            color: theme.colors.gray[7],
            fontSize: theme.fontSizes.sm,
            flex: '0 0 auto',
          }}
        >
          {cell.label}
        </Box>
      );
    }

    const { color, monitor, monitors: monitorsForSeat } = getSeatStatusColor(cell);
    const duplicatesCount = monitorsForSeat.length > 1 ? monitorsForSeat.length : null;

    const tooltipContent = (
      <Stack gap={4}>
        <Text fw={600} size="sm">
          {cell.label ?? cell.seatId}
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

    return (
      <Tooltip key={cellKey} label={tooltipContent} position="top" withArrow>
        <Card
          padding={Math.max(2, 4 * zoom)}
          shadow="sm"
          radius="sm"
          onClick={handleSeatClick}
          style={{
            width,
            height,
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
          <Text fw={600} size="sm" c="white" style={{ textShadow: '0 0 4px rgba(0,0,0,0.5)' }}>
            {cell.label ?? cell.seatId}
          </Text>
          {duplicatesCount && (
            <Badge
              size="xs"
              color="yellow"
              variant="filled"
              style={{ position: 'absolute', top: 4 * zoom, right: 4 * zoom }}
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
            <Box style={{ width: 16, height: 16, backgroundColor: theme.colors.green[6], borderRadius: 3 }} />
            <Text size="sm">Online</Text>
          </Group>
          <Group gap={6}>
            <Box style={{ width: 16, height: 16, backgroundColor: theme.colors.gray[5], borderRadius: 3 }} />
            <Text size="sm">Offline</Text>
          </Group>
          <Group gap={6}>
            <Box style={{ width: 16, height: 16, backgroundColor: theme.colors.gray[3], borderRadius: 3 }} />
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
    if (!layout || !layout.sections.length) {
      return (
        <Alert icon={<IconAlertTriangle size={16} />} title="Layout Configuration Missing" color="orange" variant="light">
          Define an arena layout in <code>packages/ui/app/arena/layouts.ts</code>.
        </Alert>
      );
    }

    return layout.sections.map((section) => {
      const gapSize = (section.gapSize ?? 8) * zoom;
      return (
        <Stack key={section.id} gap="xs">
          {section.title && <Title order={5}>{section.title}</Title>}
          <Stack gap={gapSize}>
            {section.rows.map((row, rowIndex) => (
              <Group key={`${section.id}-row-${rowIndex}`} gap={gapSize} wrap="nowrap">
                {row.map((cell, cellIndex) => renderCell(cell, section, rowIndex, cellIndex))}
              </Group>
            ))}
          </Stack>
        </Stack>
      );
    });
  };

  return (
    <Card padding="md" withBorder radius="md" pos="relative">
      <LoadingOverlay visible={!!isLoading} zIndex={100} overlayProps={{ radius: 'sm', blur: 2 }} />
      <Stack gap="md">
        <Group justify="space-between" align="center">
          <Group gap="sm">
            <Select
              label="Layout"
              placeholder="Choose an arena layout"
              value={selectedLayoutId}
              onChange={(value) => setSelectedLayoutId(value)}
              data={arenaLayouts.map((item) => ({ value: item.id, label: item.name }))}
              clearable={arenaLayouts.length > 1}
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
          </Group>
          {renderLegend()}
        </Group>
        <ScrollArea h="65vh" type="scroll">
          <Stack gap="lg" pr="md">
            {renderSection()}
          </Stack>
        </ScrollArea>
        {unmatchedMonitors.length > 0 && (
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
