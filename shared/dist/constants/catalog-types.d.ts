export declare const CATALOG_TYPES: readonly ["parte", "estandar", "especifico"];
export type CatalogType = (typeof CATALOG_TYPES)[number];
export declare const CATALOG_DIVISIONS: readonly ["DP", "ACC", "MEC"];
export type CatalogDivision = (typeof CATALOG_DIVISIONS)[number];
export declare const CATALOG_SUBTYPES: readonly ["servicio_dp", "en_stock", "a_pedido", "estandar", "especifico"];
export type CatalogSubtype = (typeof CATALOG_SUBTYPES)[number];
export declare const CATALOG_DIVISION_SUBTYPES: {
    readonly DP: readonly ["servicio_dp"];
    readonly ACC: readonly ["en_stock", "a_pedido"];
    readonly MEC: readonly ["estandar", "especifico"];
};
export interface CatalogClassification {
    tipo: CatalogType;
    division: CatalogDivision;
    subtipo: CatalogSubtype;
}
/** Resolve only classification. PATCH callers must supply the locked current row. */
export declare function resolveCatalogClassification(input: Partial<CatalogClassification>, current?: CatalogClassification): CatalogClassification;
export declare const DP_STAGE_KEYS: readonly ["armador_desarme", "desab_prepar", "pintor", "armador_montaje", "detailer"];
export type DpStageKey = (typeof DP_STAGE_KEYS)[number];
export declare const DP_STAGE_LABELS: Record<DpStageKey, string>;
export declare const DP_STAGE_INDEXES: Record<DpStageKey, number>;
/** Specialties within the existing operating role; these are not auth roles. */
export declare const DP_STAGE_SPECIALTIES: Record<DpStageKey, readonly string[]>;
