import { X } from 'lucide-react';

import type { ReactNode } from 'react';

interface ModalHeaderProps {
  id: string;
  title: string;
  description?: ReactNode;
  onClose: () => void;
  closeLabel?: string;
  /** Rotulo sobre el titulo, como el "Movimiento de inventario" de los ajustes de stock. */
  eyebrow?: ReactNode;
  /**
   * Badge circular de 52px de la referencia (`.dialog-badge`). Admite un icono ya
   * construido, como `<TypeIcon aria-hidden />`, o contenido propio, como las
   * iniciales del perfil de usuario.
   */
  badge?: ReactNode;
  tone?: 'primary' | 'warning' | 'success' | 'gold';
  variant?: 'plain' | 'brand';
  headingAs?: 'h1' | 'h2';
  actions?: ReactNode;
  closeDisabled?: boolean;
  children?: ReactNode;
}

const TONE = {
  primary: 'bg-brand-pale text-brand-primaryInk',
  warning: 'bg-brand-coralPale text-brand-coralInk',
  success: 'bg-brand-mintPale text-brand-mintInk',
  gold: 'bg-brand-goldPale text-brand-goldInk',
} as const;

/** White record dialogs and navy operational profiles share the same controls. */
export const ModalHeader = ({
  id,
  title,
  description,
  onClose,
  closeLabel = 'Cerrar',
  eyebrow,
  badge,
  tone = 'primary',
  variant = 'plain',
  headingAs: Heading = 'h2',
  actions,
  closeDisabled = false,
  children,
}: ModalHeaderProps) => {
  const identity = <>
    {eyebrow && <p className="ui-modal-eyebrow text-xs font-semibold uppercase text-brand-muted">{eyebrow}</p>}
    <div className="ui-modal-title-row flex items-center gap-2">
      <Heading id={id} className="text-lg font-semibold text-brand-ink">{title}</Heading>
      {children}
    </div>
    {description && <div className="ui-modal-description mt-1 text-sm text-brand-muted">{description}</div>}
  </>;
  const closeButton = <button
    type="button"
    onClick={onClose}
    disabled={closeDisabled}
    className="ui-modal-close inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-brand-muted transition hover:bg-brand-pale hover:text-brand-primaryInk disabled:opacity-50"
    aria-label={closeLabel}
    title={closeLabel}
  ><X className="h-5 w-5" aria-hidden="true" /></button>;
  return (
    <div className={`ui-modal-header ${variant === 'brand' ? 'ui-modal-header--brand' : ''} flex items-start justify-between gap-4 px-7 pb-5 pt-7`}>
      <div className="min-w-0">
        {badge && (
          <span
            className={`ui-modal-badge mb-[18px] flex h-[52px] w-[52px] items-center justify-center overflow-hidden rounded-full text-base font-semibold ${TONE[tone]}`}
          >
            {badge}
          </span>
        )}
        {variant === 'brand' ? <div className="min-w-0">{identity}</div> : identity}
      </div>
      {actions ? <div className="ui-modal-header-controls">{actions}{closeButton}</div> : closeButton}
    </div>
  );
};

export default ModalHeader;
