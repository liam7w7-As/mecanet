import { LoaderCircle } from 'lucide-react';

import { ProgressBar } from './LoadingIndicator';

export default function SavingOverlay({ message, detail, progress }: { message: string; detail?: string; progress?: number }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/35 p-5 backdrop-blur-sm">
      <div
        role="status"
        aria-live="polite"
        aria-label={message}
        className="flex w-full max-w-sm flex-col items-center gap-3 rounded-2xl border border-brand-line bg-white px-6 py-7 text-center shadow-2xl"
      >
        <LoaderCircle className="h-9 w-9 animate-spin text-brand-primaryInk" aria-hidden="true" />
        <p className="text-base font-bold text-brand-primaryInk">{message}</p>
        {detail && <p className="text-sm leading-5 text-brand-muted">{detail}</p>}
        {progress !== undefined && <div className="w-full"><ProgressBar value={progress} label="Carga de fotografías" /></div>}
      </div>
    </div>
  );
}
