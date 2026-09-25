import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  onPageChange: (page: number) => void;
}

export const Pagination = ({ page, totalPages, total, onPageChange }: PaginationProps) => {
  const availablePages = Array.from({ length: Math.max(totalPages, 1) }, (_, index) => index + 1);

  return (
    <div className="flex flex-col gap-3 border-t border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-slate-500">
        {total} {total === 1 ? 'registro' : 'registros'}
      </p>
      <div className="flex min-w-0 items-center gap-2 self-start sm:self-auto">
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Página anterior"
          title="Página anterior"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <label className="flex min-w-0 items-center gap-2 text-sm text-slate-600">
          Página
          <select
            className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm font-semibold text-brand-blue"
            value={Math.min(page, Math.max(totalPages, 1))}
            onChange={(event) => onPageChange(Number(event.target.value))}
            aria-label="Seleccionar página"
          >
            {availablePages.map((pageNumber) => (
              <option key={pageNumber} value={pageNumber}>{pageNumber}</option>
            ))}
          </select>
          <span className="whitespace-nowrap">de {Math.max(totalPages, 1)}</span>
        </label>
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          onClick={() => onPageChange(page + 1)}
          disabled={totalPages === 0 || page >= totalPages}
          aria-label="Página siguiente"
          title="Página siguiente"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
};

export default Pagination;
