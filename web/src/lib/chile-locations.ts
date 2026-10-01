import { CHILE_REGIONS } from '../data/chile-locations';

export const normalizeLocationText = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');

const REGION_ALIASES: Readonly<Record<string, readonly string[]>> = {
  '01': ['I', 'Tarapacá'],
  '02': ['II', 'Antofagasta'],
  '03': ['III', 'Atacama'],
  '04': ['IV', 'Coquimbo'],
  '05': ['V', 'Valparaíso'],
  '06': [
    'VI',
    "O'Higgins",
    "Libertador General Bernardo O'Higgins",
    "Región del Libertador General Bernardo O'Higgins",
  ],
  '07': ['VII', 'Maule'],
  '08': ['VIII', 'Biobío', 'Bío Bío'],
  '09': ['IX', 'Araucanía', 'La Araucanía'],
  '10': ['X', 'Los Lagos'],
  '11': [
    'XI',
    'Aysén',
    'Aysén del General Carlos Ibáñez del Campo',
    'Región de Aysén del General Carlos Ibáñez del Campo',
  ],
  '12': ['XII', 'Magallanes', 'Magallanes y de la Antártica Chilena'],
  '13': ['XIII', 'RM', 'Metropolitana', 'Región Metropolitana', 'Metropolitana de Santiago'],
  '14': ['XIV', 'Los Ríos'],
  '15': ['XV', 'Arica y Parinacota'],
  '16': ['XVI', 'Ñuble'],
};

export const regionOptions = CHILE_REGIONS.map((region) => ({
  value: region.name,
  label: region.name,
  keywords: REGION_ALIASES[region.code] ?? [],
}));

export const findChileRegion = (name: string) => {
  const normalized = normalizeLocationText(name);
  return CHILE_REGIONS.find((region) =>
    [region.name, ...(REGION_ALIASES[region.code] ?? [])].some(
      (alias) => normalizeLocationText(alias) === normalized,
    ),
  );
};

export const findCommuneRegion = (name: string) => {
  const normalized = normalizeLocationText(name);
  return CHILE_REGIONS.find((region) =>
    region.communes.some((commune) => normalizeLocationText(commune) === normalized),
  );
};
