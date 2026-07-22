import type { ArenaLayoutDocument, ArenaLayoutSectionDocument } from './types';

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
    ...section,
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
    ...source,
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

export const parseArenaLayouts = (input: unknown): ArenaLayoutDocument[] => {
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

const cloneLayout = (layout: ArenaLayoutDocument): ArenaLayoutDocument => JSON.parse(JSON.stringify(layout));

export const mergeGeneratedArenaLayout = (
  layouts: ArenaLayoutDocument[],
  editingId: string | null,
  generatedLayout: ArenaLayoutDocument,
): { layouts: ArenaLayoutDocument[]; savedLayout: ArenaLayoutDocument } => {
  const next = layouts.map(cloneLayout);
  const existing = layouts.find((layout) => layout.id === editingId);
  const savedLayout: ArenaLayoutDocument = {
    ...(existing ? cloneLayout(existing) : {}),
    ...generatedLayout,
    meta: { ...existing?.meta, ...generatedLayout.meta },
    sections: generatedLayout.sections.map((section, sectionIndex) => ({
      ...existing?.sections?.[sectionIndex],
      ...section,
    })),
  };
  if (savedLayout.default) next.forEach((layout) => { layout.default = false; });
  const index = next.findIndex((layout) => layout.id === editingId);
  if (index >= 0) next[index] = savedLayout;
  else next.push(savedLayout);
  return { layouts: next, savedLayout };
};
