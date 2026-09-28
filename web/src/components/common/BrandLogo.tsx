import { useCompanyBranding } from './BrandingContext';
import { cn } from '../../lib/utils';

interface BrandLogoProps {
  /** Alto del logo en Tailwind. El ancho se calcula desde la proporción del archivo. */
  heightClassName?: string;
  className?: string;
  /** Invierte los colores para fondos oscuros (queda blanco sobre azul marino). */
  inverted?: boolean;
  alt?: string;
  /** Ignora el logo configurado y usa siempre el asset estático. */
  useConfigured?: boolean;
}

/**
 * Lee el branding del contexto, no del query: así funciona también en tests y
 * en cualquier árbol que no monte el `BrandingProvider`, degrading al asset
 * estático en vez de romper.
 */
export const BrandLogo = ({
  heightClassName = 'h-7',
  className,
  inverted = false,
  alt,
  useConfigured = true,
}: BrandLogoProps) => {
  const company = useCompanyBranding();
  const resolvedAlt = alt ?? company.nombreComercial;
  const src = useConfigured ? company.logoUrl : '/marca.webp';

  return (
    <img
      src={src}
      alt={resolvedAlt}
      className={cn(
        'w-auto object-contain',
        heightClassName,
        inverted && 'invert',
        className,
      )}
      onError={(event) => {
        // Si el logo configurado falla, se oculta el <img> en vez de dejar
        // el ícono roto; el texto de la marca sigue visible al lado.
        (event.currentTarget as HTMLElement).style.display = 'none';
      }}
    />
  );
};

export default BrandLogo;
