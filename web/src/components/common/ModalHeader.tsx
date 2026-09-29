import { X } from 'lucide-react';

import type { ReactNode } from 'react';

interface ModalHeaderProps {
  id: string;
  title: string;
  description?: ReactNode;
  onClose: () => void;
  closeLabel?: string;
  /** Rotulo sobre el titulo, como el "Movimiento de inventario" de los ajustes de stock. */
  eyebrow?: string;
  /**
   * Badge circular de 52px de la referencia (`.dialog-badge`). Admite un icono ya
   * construido, como `<TypeIcon aria-hidden />`, o contenido propio, como las
   * iniciales del perfil de usuario.
   */
  badge?: ReactNode;
  tone?: 'primary' | 'warning' | 'success' | 'gold';
  children?: ReactNode;
}

const TONE = {
  primary: 'bg-brand-pale text-brand-primaryInk',
  warning: 'bg-brand-coralPale text-brand-coralInk',
  success: 'bg-brand-mintPale text-brand-mintInk',
  gold: 'bg-brand-goldPale text-brand-goldInk',
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
  eyebrow,
  badge,
  tone = 'primary',
  children,
}: ModalHeaderProps) => {
  return (
    <div className="flex items-start justify-between gap-4 px-7 pb-5 pt-7">
      <div className="min-w-0">
        {badge && (
          <span
            className={`mb-[18px] flex h-[52px] w-[52px] items-center justify-center overflow-hidden rounded-full text-base font-semibold ${TONE[tone]}`}
          >
            {badge}
          </span>
        )}
        {eyebrow && <p className="text-xs font-semibold uppercase text-brand-muted">{eyebrow}</p>}
        <div className="flex items-center gap-2">
          <h2 id={id} className="text-lg font-semibold text-brand-ink">
            {title}
          </h2>
          {children}
        </div>
        {description && <div className="mt-1 text-sm text-brand-muted">{description}</div>}
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
};

export default ModalHeader;
