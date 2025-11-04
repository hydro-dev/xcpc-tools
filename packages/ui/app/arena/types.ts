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

export interface ArenaLayoutDocument {
  id: string;
  name: string;
  description?: string;
  seatKey?: string;
  normalize?: ArenaNormalizerId | string;
  default?: boolean;
  sections: ArenaLayoutSectionDocument[];
  meta?: Record<string, unknown>;
}
