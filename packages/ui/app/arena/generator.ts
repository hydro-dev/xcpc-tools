import type {
  ArenaGeneratorArea, ArenaLayoutDocument, ArenaLayoutGenerator, ArenaSeatDirection,
} from './types';

export interface ArenaEditorDraft {
  id: string;
  name: string;
  description: string;
  isDefault: boolean;
  generator: ArenaLayoutGenerator;
}

export const MAX_ARENA_SEATS = 100_000;
export const MAX_ARENA_CELLS = 100_000;
export const MAX_AREA_GRID_SIDE = 12;
export const MAX_AREA_SEAT_SIDE = 999;
export const DEFAULT_ARENA_SEAT_ID_TEMPLATE = '[group:1][row:2][col:2]';
export const ARENA_SEAT_ID_TEMPLATES = [
  DEFAULT_ARENA_SEAT_ID_TEMPLATE,
  '[group]-[id]',
];
const SEAT_ID_TOKEN = /\[(group|row|col|id)(?::(\d+))?]/g;

export interface ParsedArenaSeatIdTemplate {
  source: string;
  groupWidth?: number;
  rowWidth?: number;
  colWidth?: number;
  idWidth?: number;
}

export const parseArenaSeatIdTemplate = (source: unknown): ParsedArenaSeatIdTemplate => {
  const template = String(source || '').trim();
  if (!template) throw new Error('Seat ID template cannot be empty');
  const parsed: ParsedArenaSeatIdTemplate = { source: template };
  const tokens = new Set<string>();
  for (const match of template.matchAll(SEAT_ID_TOKEN)) {
    const token = match[1] as 'group' | 'row' | 'col' | 'id';
    const width = match[2] ? Number(match[2]) : undefined;
    if (width !== undefined && (!Number.isInteger(width) || width < 1 || width > 8)) {
      throw new Error(`Seat ID template width for ${token} must be between 1 and 8`);
    }
    tokens.add(token);
    if (width !== undefined) {
      if (token === 'group') parsed.groupWidth = width;
      else if (token === 'row') parsed.rowWidth = width;
      else if (token === 'col') parsed.colWidth = width;
      else parsed.idWidth = width;
    }
  }
  if (/\[[^\]]*]/.test(template.replace(SEAT_ID_TOKEN, ''))) {
    throw new Error('Seat ID template contains an unsupported token');
  }
  if (!tokens.has('group')) throw new Error('Seat ID template must include [group]');
  if (!tokens.has('id') && !(tokens.has('row') && tokens.has('col'))) {
    throw new Error('Seat ID template must include [id] or both [row] and [col]');
  }
  return parsed;
};

export const seatIdTemplateGroupWidth = (template: string): number | undefined => {
  const match = /\[group:(\d+)]/.exec(template);
  return match ? Math.max(1, Math.min(8, Number(match[1]) || 1)) : undefined;
};

export const groupLabelForIndex = (index: number, width?: number): string => {
  const capacity = width ? 26 ** width : Number.MAX_SAFE_INTEGER;
  if (!Number.isInteger(index) || index < 0 || index >= capacity) {
    throw new Error(`Group index exceeds the ${width}-letter template capacity`);
  }
  let cursor = width ? index : index + 1;
  let result = '';
  while (width ? result.length < width : cursor > 0) {
    if (!width) cursor -= 1;
    result = String.fromCharCode(65 + (cursor % 26)) + result;
    cursor = Math.floor(cursor / 26);
  }
  return result;
};

export const createArea = (index: number, groupWidth?: number): ArenaGeneratorArea => ({
  id: `area-${index + 1}`,
  label: groupLabelForIndex(index, groupWidth),
  rows: 6,
  cols: 8,
  rowBlanks: [],
  columnBlanks: [],
});

export const createGenerator = (
  seatIdTemplate = DEFAULT_ARENA_SEAT_ID_TEMPLATE,
): ArenaLayoutGenerator => ({
  seatIdTemplate,
  areaRows: 2,
  areaCols: 2,
  areas: Array.from({ length: 4 }, (_, index) => createArea(index, seatIdTemplateGroupWidth(seatIdTemplate))),
  seatGap: 8,
  horizontalGapCells: 1,
  verticalGapRows: 1,
  direction: 'forward',
});

const positiveInteger = (value: unknown, fallback: number, max: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(max, Math.round(parsed)));
};
const nonNegativeInteger = (value: unknown, max: number): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(max, Math.round(parsed)));
};
export const normalizeGenerator = (
  source?: Partial<ArenaLayoutGenerator>,
): ArenaLayoutGenerator => {
  const seatIdTemplate = source && 'seatIdTemplate' in source
    ? String(source.seatIdTemplate ?? '').trim()
    : DEFAULT_ARENA_SEAT_ID_TEMPLATE;
  const groupWidth = seatIdTemplateGroupWidth(seatIdTemplate);
  const groupCapacity = groupWidth ? Math.min(26 ** groupWidth, MAX_AREA_GRID_SIDE ** 2) : MAX_AREA_GRID_SIDE ** 2;
  const defaults = createGenerator(seatIdTemplate);
  const requestedAreaCols = positiveInteger(source?.areaCols, defaults.areaCols, MAX_AREA_GRID_SIDE);
  const areaCols = Math.min(requestedAreaCols, groupCapacity);
  const areaRows = Math.min(
    positiveInteger(source?.areaRows, defaults.areaRows, MAX_AREA_GRID_SIDE),
    Math.max(1, Math.floor(groupCapacity / areaCols)),
  );
  const count = areaRows * areaCols;
  const sourceAreas = Array.isArray(source?.areas) ? source.areas : defaults.areas;
  const areas = Array.from({ length: count }, (_, index) => {
    const fallback = createArea(index, groupWidth);
    const current = sourceAreas[index];
    const rows = positiveInteger(current?.rows, fallback.rows, MAX_AREA_SEAT_SIDE);
    const cols = positiveInteger(current?.cols, fallback.cols, MAX_AREA_SEAT_SIDE);
    const rowBlanks = Array.isArray(current?.rowBlanks) ? current.rowBlanks.map((blank, blankIndex) => {
      const fromRow = positiveInteger(blank?.fromRow, 1, rows);
      const toRow = positiveInteger(blank?.toRow, rows, rows);
      return {
        id: String(blank?.id || `blank-${index + 1}-${blankIndex + 1}`),
        fromRow: Math.min(fromRow, toRow),
        toRow: Math.max(fromRow, toRow),
        left: nonNegativeInteger(blank?.left, cols),
        right: nonNegativeInteger(blank?.right, cols),
      };
    }) : [];
    const columnBlanks = Array.isArray(current?.columnBlanks) ? current.columnBlanks.map((blank, blankIndex) => {
      const fromColumn = positiveInteger(blank?.fromColumn, 1, cols);
      const toColumn = positiveInteger(blank?.toColumn, cols, cols);
      return {
        id: String(blank?.id || `column-blank-${index + 1}-${blankIndex + 1}`),
        fromColumn: Math.min(fromColumn, toColumn),
        toColumn: Math.max(fromColumn, toColumn),
        top: nonNegativeInteger(blank?.top, rows),
        bottom: nonNegativeInteger(blank?.bottom, rows),
      };
    }) : [];
    return {
      id: String(current?.id || fallback.id),
      label: String(current?.label || fallback.label).trim().toUpperCase(),
      rows,
      cols,
      rowBlanks,
      columnBlanks,
    };
  });
  const directions: ArenaSeatDirection[] = ['forward', 'reverse', 'snake-forward', 'snake-reverse'];
  const direction = directions.includes(source?.direction as ArenaSeatDirection)
    ? source?.direction as ArenaSeatDirection
    : 'forward';
  return {
    seatIdTemplate,
    areaRows,
    areaCols,
    areas,
    seatGap: Math.max(0, Math.min(64, Number(source?.seatGap ?? defaults.seatGap) || 0)),
    horizontalGapCells: Math.max(0, Math.min(8, Math.round(
      Number(source?.horizontalGapCells ?? defaults.horizontalGapCells) || 0,
    ))),
    verticalGapRows: Math.max(0, Math.min(8, Math.round(
      Number(source?.verticalGapRows ?? defaults.verticalGapRows) || 0,
    ))),
    direction,
  };
};

export const createDraft = (layout?: ArenaLayoutDocument | null): ArenaEditorDraft => ({
  id: layout?.id || `layout-${Date.now().toString(36)}`,
  name: layout?.name || 'Main arena',
  description: layout?.description || '',
  isDefault: layout?.default === true,
  generator: normalizeGenerator(layout?.meta?.generator),
});

export interface ArenaGeneratorEstimate {
  seats: number;
  cells: number;
  width: number;
  height: number;
  columnWidths: number[];
  rowHeights: number[];
}

const rowBlanksFor = (area: ArenaGeneratorArea, row: number) => area.rowBlanks.reduce(
  (result, blank) => (row >= blank.fromRow && row <= blank.toRow
    ? { left: result.left + blank.left, right: result.right + blank.right }
    : result),
  { left: 0, right: 0 },
);

const columnBlanksFor = (area: ArenaGeneratorArea, column: number) => area.columnBlanks.reduce(
  (result, blank) => (column >= blank.fromColumn && column <= blank.toColumn
    ? { top: result.top + blank.top, bottom: result.bottom + blank.bottom }
    : result),
  { top: 0, bottom: 0 },
);

const isBlankPosition = (area: ArenaGeneratorArea, row: number, column: number) => {
  const rowBlanks = rowBlanksFor(area, row);
  if (rowBlanks.left + rowBlanks.right > area.cols) {
    throw new Error(`Area ${area.label} row ${row} has more empty positions than columns`);
  }
  const columnBlanks = columnBlanksFor(area, column);
  if (columnBlanks.top + columnBlanks.bottom > area.rows) {
    throw new Error(`Area ${area.label} column ${column} has more empty positions than rows`);
  }
  return column <= rowBlanks.left
    || column > area.cols - rowBlanks.right
    || row <= columnBlanks.top
    || row > area.rows - columnBlanks.bottom;
};

interface ArenaSeatPosition {
  row: number;
  column: number;
}

const areaSeatPositions = (area: ArenaGeneratorArea, snake: boolean) => {
  const positions: ArenaSeatPosition[] = [];
  for (let row = 1; row <= area.rows; row += 1) {
    const columns = Array.from({ length: area.cols }, (unused, index) => index + 1)
      .filter((column) => !isBlankPosition(area, row, column));
    if (snake && row % 2 === 0) columns.reverse();
    positions.push(...columns.map((column) => ({ row, column })));
  }
  return positions;
};

export const estimateGenerator = (generator: ArenaLayoutGenerator): ArenaGeneratorEstimate => {
  const columnWidths = Array.from({ length: generator.areaCols }, (unusedColumn, areaCol) => Math.max(
    ...Array.from({ length: generator.areaRows }, (unusedRow, areaRow) => (
      generator.areas[areaRow * generator.areaCols + areaCol]?.cols || 0
    )),
  ));
  const rowHeights = Array.from({ length: generator.areaRows }, (unusedRow, areaRow) => Math.max(
    ...generator.areas
      .slice(areaRow * generator.areaCols, (areaRow + 1) * generator.areaCols)
      .map((area) => area.rows),
  ));
  const width = columnWidths.reduce((sum, value) => sum + value, 0)
    + generator.horizontalGapCells * Math.max(0, generator.areaCols - 1);
  const contentHeight = rowHeights.reduce((sum, value) => sum + value, 0);
  const height = contentHeight + generator.verticalGapRows * Math.max(0, generator.areaRows - 1);
  const cells = width * height;
  const seats = cells > MAX_ARENA_CELLS
    ? generator.areas.reduce((sum, area) => sum + area.rows * area.cols, 0)
    : generator.areas.reduce((sum, area) => sum + areaSeatPositions(area, false).length, 0);
  return {
    seats,
    cells,
    width,
    height,
    columnWidths,
    rowHeights,
  };
};

const addGapRows = (target: (string | null)[][], count: number, width: number) => {
  for (let index = 0; index < count; index += 1) target.push(Array.from({ length: width }, () => null));
};

const formatGeneratedSeatId = (
  template: ParsedArenaSeatIdTemplate,
  area: ArenaGeneratorArea,
  row: number,
  col: number,
  id: number,
) => template.source.replace(SEAT_ID_TOKEN, (unused, token: string, widthSource: string | undefined) => {
  const width = widthSource ? Number(widthSource) : 0;
  if (token === 'group') {
    if (width && area.label.length !== width) {
      throw new Error(`Group ${area.label} must contain exactly ${width} characters`);
    }
    return area.label;
  }
  const value = token === 'row' ? row : token === 'col' ? col : id;
  const result = String(value);
  if (width && result.length > width) {
    throw new Error(`${token} ${value} exceeds the ${width}-digit template width`);
  }
  return width ? result.padStart(width, '0') : result;
});

const logicalPosition = (
  area: ArenaGeneratorArea,
  direction: ArenaSeatDirection,
  position: ArenaSeatPosition,
) => {
  if (direction === 'reverse') {
    return { row: area.rows - position.row + 1, column: area.cols - position.column + 1 };
  }
  if (direction === 'snake-forward' && position.row % 2 === 0) {
    return { row: position.row, column: area.cols - position.column + 1 };
  }
  if (direction === 'snake-reverse') {
    return {
      row: area.rows - position.row + 1,
      column: position.row % 2 === 1 ? area.cols - position.column + 1 : position.column,
    };
  }
  return position;
};

const numberedAreaSeats = (area: ArenaGeneratorArea, direction: ArenaSeatDirection) => {
  const positions = areaSeatPositions(area, direction.startsWith('snake'));
  const descending = direction === 'reverse' || direction === 'snake-reverse';
  const seats = new Map<string, ArenaSeatPosition & { id: number }>();
  positions.forEach((position, index) => {
    seats.set(`${position.row}:${position.column}`, {
      ...logicalPosition(area, direction, position),
      id: descending ? positions.length - index : index + 1,
    });
  });
  return seats;
};

export const generateLayout = (draft: ArenaEditorDraft): ArenaLayoutDocument => {
  const generator = normalizeGenerator(draft.generator);
  const seatIdTemplate = parseArenaSeatIdTemplate(generator.seatIdTemplate);
  const groupLabels = new Set<string>();
  for (const area of generator.areas) {
    if (!area.label) throw new Error('Every area needs a group label');
    if (groupLabels.has(area.label)) throw new Error(`Group ${area.label} is used more than once`);
    groupLabels.add(area.label);
    formatGeneratedSeatId(seatIdTemplate, area, 1, 1, 1);
  }

  const estimate = estimateGenerator(generator);
  if (estimate.cells > MAX_ARENA_CELLS) {
    throw new Error(`The layout has ${estimate.cells.toLocaleString()} cells including aisles; the limit is ${MAX_ARENA_CELLS.toLocaleString()}`);
  }
  if (estimate.seats > MAX_ARENA_SEATS) {
    throw new Error(`The layout has ${estimate.seats.toLocaleString()} seats; the limit is ${MAX_ARENA_SEATS.toLocaleString()}`);
  }

  const areaSeats = new Map<ArenaGeneratorArea, ReturnType<typeof numberedAreaSeats>>();
  generator.areas.forEach((area) => areaSeats.set(area, numberedAreaSeats(area, generator.direction)));

  const grid: (string | null)[][] = [];
  for (let areaRow = 0; areaRow < generator.areaRows; areaRow += 1) {
    const rowAreas = generator.areas.slice(
      areaRow * generator.areaCols,
      (areaRow + 1) * generator.areaCols,
    );
    const maxRows = estimate.rowHeights[areaRow];
    for (let localRow = 1; localRow <= maxRows; localRow += 1) {
      const row: (string | null)[] = [];
      rowAreas.forEach((area, areaIndex) => {
        const blockWidth = estimate.columnWidths[areaIndex];
        if (localRow <= area.rows) {
          const numberedSeats = areaSeats.get(area)!;
          for (let localColumn = 1; localColumn <= area.cols; localColumn += 1) {
            const seat = numberedSeats.get(`${localRow}:${localColumn}`);
            row.push(seat
              ? formatGeneratedSeatId(seatIdTemplate, area, seat.row, seat.column, seat.id)
              : null);
          }
          row.push(...Array.from({ length: blockWidth - area.cols }, () => null));
        } else {
          row.push(...Array.from({ length: blockWidth }, () => null));
        }
        if (areaIndex < rowAreas.length - 1) {
          row.push(...Array.from({ length: generator.horizontalGapCells }, () => null));
        }
      });
      grid.push(row);
    }
    if (areaRow < generator.areaRows - 1) {
      addGapRows(grid, generator.verticalGapRows, estimate.width);
    }
  }

  const seen = new Set<string>();
  for (const row of grid) {
    for (const seat of row) {
      if (!seat) continue;
      if (seen.has(seat)) throw new Error(`Generated duplicate seat ${seat}`);
      seen.add(seat);
    }
  }
  if (!seen.size) throw new Error('The layout must contain at least one seat');

  return {
    id: draft.id.trim(),
    name: draft.name.trim(),
    description: draft.description.trim() || undefined,
    seatKey: 'name',
    normalize: 'trim-upper',
    default: draft.isDefault,
    sections: [{
      id: `${draft.id.trim()}-main`,
      grid,
      seatSize: 36,
      gapSize: generator.seatGap,
    }],
    meta: { generator },
  };
};
