import { FileSpreadsheet, FileText, LoaderCircle } from 'lucide-react';

import { useListExport } from '../../hooks/useListExport';

import type { ListExportTarget } from '@unithor/shared';

interface ListExportButtonsProps {
  target: ListExportTarget;
  filters: object;
  includeOwner?: boolean;
  disabled?: boolean;
  className?: string;
}

export default function ListExportButtons({
  target,
  filters,
  includeOwner,
  disabled = false,
  className = '',
}: ListExportButtonsProps) {
  const { allowed, pendingFormat, exportList } = useListExport(target, filters, includeOwner);
  if (!allowed) return null;
  return (
    <div
      className={`flex min-w-0 flex-wrap items-center gap-2 ${className}`}
      role="group"
      aria-label="Exportar registros de esta vista"
      aria-busy={pendingFormat !== null}
    >
      {(['excel', 'pdf'] as const).map((format) => {
        const Icon =
          pendingFormat === format ? LoaderCircle : format === 'excel' ? FileSpreadsheet : FileText;
        const label = format === 'excel' ? 'Excel' : 'PDF';
        return (
          <button
            key={format}
            type="button"
            className="secondary-button inline-flex min-h-10 items-center gap-2 rounded-full border border-brand-line bg-white px-3 py-2 text-xs font-semibold text-brand-primaryInk transition hover:bg-brand-pale disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => void exportList(format)}
            disabled={disabled || pendingFormat !== null}
            aria-label={`Exportar listado a ${label}`}
            title={`Exportar a ${label} todos los registros con los filtros actuales${format === 'pdf' ? ' (abre otra pestaña)' : ''}`}
          >
            <Icon
              className={`h-4 w-4 shrink-0 ${pendingFormat === format ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            {pendingFormat === format ? 'Generando…' : label}
          </button>
        );
      })}
      <span className="sr-only" role="status">
        {pendingFormat ? 'Generando exportación con los filtros actuales' : ''}
      </span>
    </div>
  );
}
