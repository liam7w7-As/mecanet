export interface PaginationOptions {
  page?: number | string;
  limit?: number | string;
  pageSize?: number | string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface PaginationResult {
  limit: number;
  offset: number;
  page: number;
  meta: (total: number) => PaginationMeta;
}

export const getPagination = (options?: PaginationOptions): PaginationResult => {
  const rawPage = options?.page ?? 1;
  const rawLimit = options?.limit ?? options?.pageSize ?? 20;

  // Normalizar page: mínimo 1, entero
  const page = Math.max(1, Math.floor(Number(rawPage) || 1));

  // Normalizar limit: mínimo 1, máximo 100, entero
  const limit = Math.max(1, Math.min(100, Math.floor(Number(rawLimit) || 20)));

  const offset = (page - 1) * limit;

  return {
    limit,
    offset,
    page,
    meta: (total: number): PaginationMeta => {
      const safeTotal = Math.max(0, Math.floor(Number(total) || 0));
      const totalPages = safeTotal > 0 ? Math.ceil(safeTotal / limit) : 0;

      return {
        page,
        limit,
        total: safeTotal,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      };
    },
  };
};

export const paginate = getPagination;
