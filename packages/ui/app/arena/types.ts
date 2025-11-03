export type ArenaCell =
  | ArenaSeatCell
  | ArenaGapCell
  | ArenaLabelCell;

export interface ArenaSeatCell {
  type: 'seat';
  seatId: string;
  label?: string;
  span?: number;
  meta?: Record<string, unknown>;
}

export interface ArenaGapCell {
  type: 'gap';
  span?: number;
}

export interface ArenaLabelCell {
  type: 'label';
  label: string;
  span?: number;
  align?: 'left' | 'center' | 'right';
}

export type ArenaRow = ArenaCell[];

export interface ArenaSectionConfig {
  id: string;
  title?: string;
  seatSize?: number;
  gapSize?: number;
  rows: ArenaRow[];
}

export interface ArenaLayoutConfig {
  id: string;
  name: string;
  description?: string;
  /**
   * Monitor field to match against the seatId. Supports dotted paths like "extras.seat".
   * If undefined, the monitor name is used as fallback.
   */
  seatKey?: string;
  /**
   * Custom seat extractor. Receives the monitor record and should return the logical seat id.
   * Overrides seatKey when provided.
   */
  resolveMonitorSeat?: (monitor: Record<string, any>) => string | null | undefined;
  /**
   * Optional seat id normalizer. Useful when seat naming follows custom casing.
   */
  normalizeSeatId?: (seatId: string) => string;
  sections: ArenaSectionConfig[];
}
