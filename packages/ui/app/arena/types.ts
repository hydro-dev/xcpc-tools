export type ArenaNormalizerId =
  | 'none'
  | 'upper'
  | 'lower'
  | 'trim'
  | 'trim-upper'
  | 'trim-lower';

export interface ArenaLayoutSectionDocument {
  id: string;
  title?: string;
  rowLabels?: (string | null)[];
  grid: (string | null)[][];
  seatSize?: number;
  gapSize?: number;
  meta?: Record<string, unknown>;
}

export interface ArenaGeneratorArea {
  id: string;
  label: string;
  rows: number;
  cols: number;
  rowBlanks: ArenaGeneratorRowBlank[];
  columnBlanks: ArenaGeneratorColumnBlank[];
}

export interface ArenaGeneratorRowBlank {
  id: string;
  fromRow: number;
  toRow: number;
  left: number;
  right: number;
}

export interface ArenaGeneratorColumnBlank {
  id: string;
  fromColumn: number;
  toColumn: number;
  top: number;
  bottom: number;
}

export type ArenaSeatDirection = 'forward' | 'reverse' | 'snake-forward' | 'snake-reverse';

export interface ArenaLayoutGenerator {
  seatIdTemplate: string;
  areaRows: number;
  areaCols: number;
  areas: ArenaGeneratorArea[];
  seatGap: number;
  horizontalGapCells: number;
  verticalGapRows: number;
  direction: ArenaSeatDirection;
}

export interface ArenaLayoutDocument {
  id: string;
  name: string;
  description?: string;
  seatKey?: string;
  normalize?: ArenaNormalizerId | string;
  default?: boolean;
  sections: ArenaLayoutSectionDocument[];
  meta?: Record<string, unknown> & { generator?: ArenaLayoutGenerator };
}

export interface ArenaLayoutsResponse {
  revision: string;
  layouts: ArenaLayoutDocument[];
}
