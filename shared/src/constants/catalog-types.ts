export const CATALOG_TYPES = ['parte', 'estandar', 'especifico'] as const;

export type CatalogType = (typeof CATALOG_TYPES)[number];
