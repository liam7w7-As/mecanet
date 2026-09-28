import { createContext, useContext, useMemo } from 'react';

import { useBranding } from '../../hooks/useSettings';

import type { PublicBranding } from '@unithor/shared';
import type { ReactNode } from 'react';

/** Valores por defecto: los que estaban hardcodeados antes de la configuración. */
const FALLBACK_LABELS: CompanyLabels = {
  razonSocial: 'UNITHOR SERVICIOS INTEGRALES SPA',
  nombreComercial: 'UNITHOR',
  rut: '77.374.788-1',
  direccion: 'Arturo Fernández 2101',
  region: 'Tarapacá',
  comuna: 'Iquique',
  telefono: '+56 9 2375 7478',
  email: 'contacto@unithor.cl',
  sitioWeb: 'unithor.cl',
  logoUrl: '/marca.webp',
};

export interface CompanyLabels {
  razonSocial: string;
  nombreComercial: string;
  rut: string | null;
  direccion: string | null;
  region: string | null;
  comuna: string | null;
  telefono: string | null;
  email: string | null;
  sitioWeb: string | null;
  logoUrl: string;
}

export interface CompanyBrandingValue extends CompanyLabels {
  isLoading: boolean;
  /** "Arturo Fernández 2101, Iquique, Tarapacá" (omite los vacíos). */
  addressLine: string;
  /** "Fono: +56 9 ... | contacto@unithor.cl" (omite los vacíos). */
  contactLine: string;
  /** "R.U.T. 77.374.788-1" o cadena vacía si no hay RUT configurado. */
  rutLine: string;
}

const BrandingContext = createContext<CompanyBrandingValue>({
  ...FALLBACK_LABELS,
  addressLine: 'Arturo Fernández 2101, Iquique, Tarapacá',
  contactLine: 'Fono: +56 9 2375 7478 | contacto@unithor.cl',
  rutLine: 'R.U.T. 77.374.788-1',
  isLoading: false,
});

const joinParts = (parts: Array<string | null | undefined>, separator = ', '): string =>
  parts.map((part) => part?.trim()).filter((part): part is string => Boolean(part)).join(separator);

const toValue = (branding: PublicBranding | undefined): CompanyBrandingValue => {
  if (!branding) {
    return {
      ...FALLBACK_LABELS,
      logoUrl: '/marca.webp',
      addressLine: joinParts(['Arturo Fernández 2101', 'Iquique', 'Tarapacá']),
      contactLine: joinParts(
        [FALLBACK_LABELS.telefono ? `Fono: ${FALLBACK_LABELS.telefono}` : null, FALLBACK_LABELS.email],
        ' | ',
      ),
      rutLine: 'R.U.T. 77.374.788-1',
      isLoading: true,
    };
  }

  const labels: CompanyLabels = {
    razonSocial: branding.razonSocial,
    nombreComercial: branding.nombreComercial || branding.razonSocial,
    rut: branding.rut,
    direccion: branding.direccion,
    region: branding.region,
    comuna: branding.comuna,
    telefono: branding.telefono,
    email: branding.email,
    sitioWeb: branding.sitioWeb,
    logoUrl: branding.tieneLogo
      ? `/api/settings/company/logo?v=${encodeURIComponent(branding.logoUpdatedAt ?? '1')}`
      : '/marca.webp',
  };

  return {
    ...labels,
    addressLine: joinParts([labels.direccion, labels.comuna, labels.region]),
    contactLine: joinParts(
      [labels.telefono ? `Fono: ${labels.telefono}` : null, labels.email],
      ' | ',
    ),
    rutLine: labels.rut ? `R.U.T. ${labels.rut}` : '',
    isLoading: false,
  };
};

export const BrandingProvider = ({ children }: { children: ReactNode }) => {
  const brandingQuery = useBranding();
  const value = useMemo(() => toValue(brandingQuery.data), [brandingQuery.data]);

  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
};

/**
 * Datos de la empresa ya resueltos a texto. Se puede usar dentro y fuera del
 * `BrandingProvider`: sin provider devuelve los valores por defecto.
 */
export const useCompanyBranding = (): CompanyBrandingValue => useContext(BrandingContext);
