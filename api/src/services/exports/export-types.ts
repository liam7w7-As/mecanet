import type { ListExportTarget } from '@unithor/shared';

export type ExportValue = string | number | boolean | Date | null | undefined;
export interface ExportColumn {
  key: string;
  header: string;
  width?: number;
  kind?: 'text' | 'number' | 'money' | 'date' | 'datetime' | 'boolean';
  /** Import-only or verbose columns can be omitted from the compact PDF. */
  pdf?: boolean;
}
export interface ExportTable {
  name: string;
  columns: ExportColumn[];
  rows: Record<string, ExportValue>[];
}
export interface ExportDataset {
  title: string;
  tables: ExportTable[];
  filters: Record<string, ExportValue>;
  notes?: string[];
}
export interface ExportActor {
  id: number;
  role: string;
}
export type ExportBuilder = (
  target: ListExportTarget,
  query: Record<string, unknown>,
  actor: ExportActor,
) => Promise<ExportDataset | null>;
