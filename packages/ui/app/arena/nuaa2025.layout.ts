// nuaa2025.layout.ts

type RowItem =
  | { type: 'label'; label: string }
  | { type: 'seat'; seatId: string }
  | { type: 'gap'; span?: number };

export interface ArenaLayoutConfig {
  id: string;
  name: string;
  description?: string;
  seatKey: string;
  normalizeSeatId?: (seatId: string) => string;
  sections: {
    id: string;
    title: string;
    seatSize: number;
    gapSize: number;
    rows: RowItem[][];
  }[];
}

interface RowPattern {
  row: number;
  label?: string;
  leadingGap?: boolean;
  trailingGap?: boolean;
  blocks: Array<{
    prefix: string;
    startIndex: number;
    endIndex: number;
    gapAfter?: boolean;
    placeholder?: boolean;
  }>;
}

interface AisleSpec {
  between: [number, number];
}

function makeSeatId(prefix: string, row: number, index: number): string {
  const idx = String(index).padStart(2, '0');
  return `${prefix}${row}${idx}`;
}

function buildRowItems(p: RowPattern): RowItem[] {
  const rowItems: RowItem[] = [];
  rowItems.push({ type: 'label', label: p.label ?? String(p.row) });
  if (p.leadingGap) rowItems.push({ type: 'gap' });

  p.blocks.forEach((blk, i) => {
    if (blk.placeholder) {
      const span = Math.max(1, blk.endIndex - blk.startIndex + 1);
      rowItems.push({ type: 'gap', span });
    } else {
      for (let idx = blk.startIndex; idx <= blk.endIndex; idx++) {
        rowItems.push({ type: 'seat', seatId: makeSeatId(blk.prefix, p.row, idx) });
      }
    }
    const needGapAfter = blk.gapAfter ?? true;
    if (needGapAfter && i !== p.blocks.length - 1) rowItems.push({ type: 'gap' });
  });

  if (p.trailingGap) rowItems.push({ type: 'gap' });
  return rowItems;
}

function buildRows(patterns: RowPattern[], aisles: AisleSpec[] = []): RowItem[][] {
  const rows: RowItem[][] = patterns.map(buildRowItems);
  if (!aisles.length) return rows;

  const aislePairs = new Set(aisles.map(a => `${a.between[0]}|${a.between[1]}`));
  const withAisles: RowItem[][] = [];

  for (let i = 0; i < rows.length; i++) {
    withAisles.push(rows[i]);
    if (i + 1 < rows.length) {
      const cur = (rows[i][0] as any).label;
      const next = (rows[i + 1][0] as any).label;
      const key = `${cur}|${next}`;
      if (aislePairs.has(key)) withAisles.push([{ type: 'gap' }]);
    }
  }
  return withAisles;
}

function repeatRows(rows: number[], tpl: Omit<RowPattern, 'row' | 'label'>): RowPattern[] {
  return rows.map(r => ({
    row: r,
    label: String(r),
    ...tpl,
  }));
}

function buildArenaLayout(
  base: Omit<ArenaLayoutConfig, 'sections'>,
  section: {
    id: string;
    title: string;
    seatSize: number;
    gapSize: number;
    rowPatterns: RowPattern[];
    aisles?: AisleSpec[];
  }
): ArenaLayoutConfig {
  return {
    ...base,
    sections: [
      {
        id: section.id,
        title: section.title,
        seatSize: section.seatSize,
        gapSize: section.gapSize,
        rows: buildRows(section.rowPatterns, section.aisles),
      },
    ],
  };
}


const base = {
  id: 'nuaa2025',
  name: 'ICPC Nanjing R 2025',
  description: 'ICPC Asia Nanjing Regional 2025 Layout',
  seatKey: 'hostname',
  normalizeSeatId: (seatId: string) => seatId.trim().toUpperCase(),
};

const rowPatterns: RowPattern[] = [];

rowPatterns.push(
  ...repeatRows([20, 19], {
    leadingGap: true,
    trailingGap: true,
    blocks: [
      { prefix: 'A', startIndex: 2, endIndex: 6 },
      { prefix: 'B', startIndex: 1, endIndex: 8 },
      { prefix: 'C', startIndex: 1, endIndex: 5, gapAfter: false },
    ],
  })
);

rowPatterns.push(
  ...repeatRows([18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5], {
    leadingGap: false,
    trailingGap: false,
    blocks: [
      { prefix: 'A', startIndex: 1, endIndex: 6 },
      { prefix: 'B', startIndex: 1, endIndex: 8 },
      { prefix: 'C', startIndex: 1, endIndex: 6, gapAfter: false },
    ],
  })
);

rowPatterns.push(
  ...repeatRows([4, 3], {
    leadingGap: false,
    trailingGap: false,
    blocks: [
      { prefix: 'A', startIndex: 1, endIndex: 6 },
      { prefix: 'B', startIndex: 1, endIndex: 8, placeholder: true },
      { prefix: 'C', startIndex: 1, endIndex: 6, gapAfter: false },
    ],
  })
);

rowPatterns.push(
  ...repeatRows([2, 1], {
    leadingGap: false,
    trailingGap: false,
    blocks: [
      { prefix: 'A', startIndex: 1, endIndex: 5 },
      { prefix: 'A', startIndex: 6, endIndex: 6, placeholder: true },
      { prefix: 'B', startIndex: 1, endIndex: 8, placeholder: true },
      { prefix: 'C', startIndex: 3, endIndex: 7, gapAfter: false },
    ],
  })
);
const aisles: AisleSpec[] = [
  { between: [19, 18], },
  { between: [17, 16] },
  { between: [15, 14] },
  { between: [13, 12] },
  { between: [11, 10] },
  { between: [9, 8] },
  { between: [7, 6] },
  { between: [5, 4] },
  { between: [3, 2] },
  { between: [1, 0] },
];

const sampleLayout: ArenaLayoutConfig = buildArenaLayout(base, {
  id: 'nuaa2025-gym',
  title: 'Gym',
  seatSize: 40,
  gapSize: 10,
  rowPatterns,
  aisles,
});

export const arenaLayouts: ArenaLayoutConfig[] = [sampleLayout];
export const defaultArenaLayoutId = arenaLayouts[0]?.id ?? null;
