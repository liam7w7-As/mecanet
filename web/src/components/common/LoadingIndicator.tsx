import { LoaderCircle } from 'lucide-react';

interface PageLoaderProps {
  label?: string;
}

export const PageLoader = ({ label = 'Cargando...' }: PageLoaderProps) => (
  <div className="flex min-h-72 flex-col items-center justify-center gap-3" role="status" aria-label={label}>
    <LoaderCircle className="h-9 w-9 animate-spin text-brand-blue" aria-hidden="true" />
    <p className="text-sm font-medium text-slate-500">{label}</p>
  </div>
);

export const InlineSpinner = ({ label }: { label?: string }) => (
  <span className="inline-flex items-center gap-2" role="status" aria-label={label ?? 'Cargando'}>
    <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
    {label && <span className="text-sm text-slate-500">{label}</span>}
  </span>
);

interface ProgressBarProps {
  value: number;
  label?: string;
}

export const ProgressBar = ({ value, label }: ProgressBarProps) => {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className="w-full" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={clamped} aria-label={label ?? 'Progreso de subida'}>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
        <div
          className="h-full rounded-full bg-brand-blue transition-all duration-200"
          style={{ width: `${clamped}%` }}
        />
      </div>
      {label && (
        <p className="mt-1 text-[11px] font-semibold text-slate-500">
          {label} · {clamped}%
        </p>
      )}
    </div>
  );
};

export default PageLoader;
