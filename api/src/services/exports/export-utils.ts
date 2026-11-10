import { ApiError } from '../../utils/ApiError.js';

import type { ExportValue } from './export-types.js';

export const EXPORT_MAX_ROWS = 10_000;
export const EXPORT_BATCH_SIZE = 100;
export interface ExportPage<T> {
  items: T[];
  total: number;
  totalPages: number;
}

/** Includes every filtered page, never silently cuts a report at the screen's page size. */
export const collectExportPages = async <T>(
  fetch: (page: number) => Promise<ExportPage<T>>,
): Promise<T[]> => {
  const rows: T[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const result = await fetch(page);
    if (result.total > EXPORT_MAX_ROWS || rows.length + result.items.length > EXPORT_MAX_ROWS) {
      throw ApiError.badRequest(
        `La exportación supera ${EXPORT_MAX_ROWS.toLocaleString('es-CL')} registros. Acota los filtros para exportar el resultado completo.`,
      );
    }
    rows.push(...result.items);
    totalPages = result.totalPages;
    page++;
  } while (page <= totalPages);
  return rows;
};

export const exportFilters = (query: object): Record<string, ExportValue> =>
  Object.fromEntries(
    Object.entries(query)
      .filter(
        ([key, value]) =>
          !['page', 'pageSize', 'includeOwner'].includes(key) &&
          value !== undefined &&
          value !== null &&
          value !== '',
      )
      .map(([key, value]: [string, unknown]) => [
        key,
        typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string'
          ? value
          : String(value),
      ]),
  );

/** Export pagination is server-controlled; URL pagination never limits or expands access. */
export const exportQuery = (query: Record<string, unknown>): Record<string, unknown> => ({
  ...query,
  page: 1,
  pageSize: EXPORT_BATCH_SIZE,
});
