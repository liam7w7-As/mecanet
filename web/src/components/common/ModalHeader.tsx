import { LucideIcon, X } from 'lucide-react';
import type { ReactNode } from 'react';

interface ModalHeaderProps {
  id: string;
  title: string;
  description?: string;
  onClose: () => void;
  closeLabel?: string;
  /**
   * Icono en el badge circular de 52px de la referencia (`.dialog-badge`).
   * `warning` y `success` reproducen sus variantes de tono.
   */
  icon?: LucideIcon;
  tone?: 'primary' | 'warning' | 'success';
  children?: ReactNode;
}

const TONE = {
  primary: 'bg-brand-pale text-brand-primaryInk',
  warning: 'bg-brand-coralPale text-brand-coralInk',
  success: 'bg-brand-mintPale text-brand-mintInk',
} as const;

/**
 * Cabecera de dialogo segun la referencia Modernize (`.dialog-heading`): titulo a
 * la izquierda, cerrar circular a la derecha, sin fondo ni borde. Sustituye a
 * las tres anatomias que conviven en la app (oscura, sticky con borde y mixta);
 * al ser un componente, los 20 modales no pueden volver a divergir.
 */
export const ModalHeader = ({
  id,
  title,
  description,
  onClose,
  closeLabel = 'Cerrar',
  icon: Icon,
  tone = 'primary',
  children,
}: ModalHeaderProps) => (
  <div className="flex items-start justify-between gap-4 px-7 pb-5 pt-7">
    <div className="min-w-0">
      {Icon && (
        <span className={`mb-[18px] flex h-[52px] w-[52px] items-center justify-center rounded-full ${TONE[tone]}`}>
          <Icon className="h-6 w-6" aria-hidden="true" />
        </span>
      )}
      <div className="flex items-center gap-2">
        <h2 id={id} className="text-lg font-semibold text-brand-ink">
          {title}
        </h2>
        {children}
      </div>
      {description && <p className="mt-1 text-sm text-brand-muted">{description}</p>}
    </div>
    <button
      type="button"
      onClick={onClose}
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-brand-muted transition hover:bg-brand-pale hover:text-brand-primaryInk"
      aria-label={closeLabel}
      title={closeLabel}
    >
      <X className="h-5 w-5" aria-hidden="true" />
    </button>
  </div>
);

export default ModalHeader;
