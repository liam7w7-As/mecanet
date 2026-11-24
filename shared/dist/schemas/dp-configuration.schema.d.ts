import { z } from 'zod';
export declare const DP_PRICE_FORMULAS: readonly ["painting", "repair", "dismantling", "fixed"];
export declare const dpStageDefinitionSchema: z.ZodObject<{
    key: z.ZodEnum<["armador_desarme", "desab_prepar", "pintor", "armador_montaje", "detailer"]>;
    label: z.ZodString;
    specialties: z.ZodArray<z.ZodString, "many">;
}, "strict", z.ZodTypeAny, {
    key: "armador_desarme" | "desab_prepar" | "pintor" | "armador_montaje" | "detailer";
    label: string;
    specialties: string[];
}, {
    key: "armador_desarme" | "desab_prepar" | "pintor" | "armador_montaje" | "detailer";
    label: string;
    specialties: string[];
}>;
export declare const dpConfigurationSchema: z.ZodEffects<z.ZodObject<{
    bodyTypes: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        label: z.ZodString;
        active: z.ZodBoolean;
        sizes: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            label: z.ZodString;
            factor: z.ZodNumber;
            active: z.ZodBoolean;
        }, "strict", z.ZodTypeAny, {
            label: string;
            id: string;
            active: boolean;
            factor: number;
        }, {
            label: string;
            id: string;
            active: boolean;
            factor: number;
        }>, "many">;
    }, "strict", z.ZodTypeAny, {
        label: string;
        id: string;
        active: boolean;
        sizes: {
            label: string;
            id: string;
            active: boolean;
            factor: number;
        }[];
    }, {
        label: string;
        id: string;
        active: boolean;
        sizes: {
            label: string;
            id: string;
            active: boolean;
            factor: number;
        }[];
    }>, "many">;
    pieces: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        label: z.ZodString;
        active: z.ZodBoolean;
    }, "strict", z.ZodTypeAny, {
        label: string;
        id: string;
        active: boolean;
    }, {
        label: string;
        id: string;
        active: boolean;
    }>, "many">;
    rates: z.ZodArray<z.ZodObject<{
        bodyTypeId: z.ZodString;
        pieceId: z.ZodString;
        positionId: z.ZodString;
        positionLabel: z.ZodString;
        paintingFactor: z.ZodNumber;
        repairFactor: z.ZodNumber;
        dismantlingFactor: z.ZodNumber;
        active: z.ZodBoolean;
    }, "strict", z.ZodTypeAny, {
        active: boolean;
        bodyTypeId: string;
        pieceId: string;
        positionId: string;
        positionLabel: string;
        paintingFactor: number;
        repairFactor: number;
        dismantlingFactor: number;
    }, {
        active: boolean;
        bodyTypeId: string;
        pieceId: string;
        positionId: string;
        positionLabel: string;
        paintingFactor: number;
        repairFactor: number;
        dismantlingFactor: number;
    }>, "many">;
    tables: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        label: z.ZodString;
        formula: z.ZodEnum<["painting", "repair", "dismantling", "fixed"]>;
        basePrice: z.ZodNullable<z.ZodNumber>;
        active: z.ZodBoolean;
    }, "strict", z.ZodTypeAny, {
        label: string;
        id: string;
        active: boolean;
        formula: "painting" | "repair" | "dismantling" | "fixed";
        basePrice: number | null;
    }, {
        label: string;
        id: string;
        active: boolean;
        formula: "painting" | "repair" | "dismantling" | "fixed";
        basePrice: number | null;
    }>, "many">;
    operations: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        label: z.ZodString;
        scope: z.ZodEnum<["piece", "global", "additional"]>;
        tableId: z.ZodString;
        multiplier: z.ZodNullable<z.ZodNumber>;
        active: z.ZodBoolean;
        requiresDamage: z.ZodBoolean;
    }, "strict", z.ZodTypeAny, {
        label: string;
        id: string;
        active: boolean;
        scope: "piece" | "global" | "additional";
        tableId: string;
        multiplier: number | null;
        requiresDamage: boolean;
    }, {
        label: string;
        id: string;
        active: boolean;
        scope: "piece" | "global" | "additional";
        tableId: string;
        multiplier: number | null;
        requiresDamage: boolean;
    }>, "many">;
    damageLevels: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        label: z.ZodString;
        increment: z.ZodNumber;
        active: z.ZodBoolean;
    }, "strict", z.ZodTypeAny, {
        label: string;
        id: string;
        active: boolean;
        increment: number;
    }, {
        label: string;
        id: string;
        active: boolean;
        increment: number;
    }>, "many">;
    stages: z.ZodArray<z.ZodObject<{
        key: z.ZodEnum<["armador_desarme", "desab_prepar", "pintor", "armador_montaje", "detailer"]>;
        label: z.ZodString;
        specialties: z.ZodArray<z.ZodString, "many">;
    }, "strict", z.ZodTypeAny, {
        key: "armador_desarme" | "desab_prepar" | "pintor" | "armador_montaje" | "detailer";
        label: string;
        specialties: string[];
    }, {
        key: "armador_desarme" | "desab_prepar" | "pintor" | "armador_montaje" | "detailer";
        label: string;
        specialties: string[];
    }>, "many">;
}, "strict", z.ZodTypeAny, {
    bodyTypes: {
        label: string;
        id: string;
        active: boolean;
        sizes: {
            label: string;
            id: string;
            active: boolean;
            factor: number;
        }[];
    }[];
    pieces: {
        label: string;
        id: string;
        active: boolean;
    }[];
    rates: {
        active: boolean;
        bodyTypeId: string;
        pieceId: string;
        positionId: string;
        positionLabel: string;
        paintingFactor: number;
        repairFactor: number;
        dismantlingFactor: number;
    }[];
    tables: {
        label: string;
        id: string;
        active: boolean;
        formula: "painting" | "repair" | "dismantling" | "fixed";
        basePrice: number | null;
    }[];
    operations: {
        label: string;
        id: string;
        active: boolean;
        scope: "piece" | "global" | "additional";
        tableId: string;
        multiplier: number | null;
        requiresDamage: boolean;
    }[];
    damageLevels: {
        label: string;
        id: string;
        active: boolean;
        increment: number;
    }[];
    stages: {
        key: "armador_desarme" | "desab_prepar" | "pintor" | "armador_montaje" | "detailer";
        label: string;
        specialties: string[];
    }[];
}, {
    bodyTypes: {
        label: string;
        id: string;
        active: boolean;
        sizes: {
            label: string;
            id: string;
            active: boolean;
            factor: number;
        }[];
    }[];
    pieces: {
        label: string;
        id: string;
        active: boolean;
    }[];
    rates: {
        active: boolean;
        bodyTypeId: string;
        pieceId: string;
        positionId: string;
        positionLabel: string;
        paintingFactor: number;
        repairFactor: number;
        dismantlingFactor: number;
    }[];
    tables: {
        label: string;
        id: string;
        active: boolean;
        formula: "painting" | "repair" | "dismantling" | "fixed";
        basePrice: number | null;
    }[];
    operations: {
        label: string;
        id: string;
        active: boolean;
        scope: "piece" | "global" | "additional";
        tableId: string;
        multiplier: number | null;
        requiresDamage: boolean;
    }[];
    damageLevels: {
        label: string;
        id: string;
        active: boolean;
        increment: number;
    }[];
    stages: {
        key: "armador_desarme" | "desab_prepar" | "pintor" | "armador_montaje" | "detailer";
        label: string;
        specialties: string[];
    }[];
}>, {
    bodyTypes: {
        label: string;
        id: string;
        active: boolean;
        sizes: {
            label: string;
            id: string;
            active: boolean;
            factor: number;
        }[];
    }[];
    pieces: {
        label: string;
        id: string;
        active: boolean;
    }[];
    rates: {
        active: boolean;
        bodyTypeId: string;
        pieceId: string;
        positionId: string;
        positionLabel: string;
        paintingFactor: number;
        repairFactor: number;
        dismantlingFactor: number;
    }[];
    tables: {
        label: string;
        id: string;
        active: boolean;
        formula: "painting" | "repair" | "dismantling" | "fixed";
        basePrice: number | null;
    }[];
    operations: {
        label: string;
        id: string;
        active: boolean;
        scope: "piece" | "global" | "additional";
        tableId: string;
        multiplier: number | null;
        requiresDamage: boolean;
    }[];
    damageLevels: {
        label: string;
        id: string;
        active: boolean;
        increment: number;
    }[];
    stages: {
        key: "armador_desarme" | "desab_prepar" | "pintor" | "armador_montaje" | "detailer";
        label: string;
        specialties: string[];
    }[];
}, {
    bodyTypes: {
        label: string;
        id: string;
        active: boolean;
        sizes: {
            label: string;
            id: string;
            active: boolean;
            factor: number;
        }[];
    }[];
    pieces: {
        label: string;
        id: string;
        active: boolean;
    }[];
    rates: {
        active: boolean;
        bodyTypeId: string;
        pieceId: string;
        positionId: string;
        positionLabel: string;
        paintingFactor: number;
        repairFactor: number;
        dismantlingFactor: number;
    }[];
    tables: {
        label: string;
        id: string;
        active: boolean;
        formula: "painting" | "repair" | "dismantling" | "fixed";
        basePrice: number | null;
    }[];
    operations: {
        label: string;
        id: string;
        active: boolean;
        scope: "piece" | "global" | "additional";
        tableId: string;
        multiplier: number | null;
        requiresDamage: boolean;
    }[];
    damageLevels: {
        label: string;
        id: string;
        active: boolean;
        increment: number;
    }[];
    stages: {
        key: "armador_desarme" | "desab_prepar" | "pintor" | "armador_montaje" | "detailer";
        label: string;
        specialties: string[];
    }[];
}>;
export declare const dpQuoteInputSchema: z.ZodEffects<z.ZodObject<{
    configurationRevision: z.ZodNumber;
    bodyTypeId: z.ZodString;
    sizeId: z.ZodString;
    pieceId: z.ZodOptional<z.ZodString>;
    positionId: z.ZodOptional<z.ZodString>;
    damageLevelId: z.ZodOptional<z.ZodString>;
    scope: z.ZodDefault<z.ZodEnum<["piece", "global"]>>;
    operations: z.ZodArray<z.ZodObject<{
        descuentoTipo: z.ZodOptional<z.ZodNullable<z.ZodEnum<["porcentaje", "fijo"]>>>;
        descuentoValor: z.ZodOptional<z.ZodNumber>;
        operationId: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        operationId: string;
        descuentoTipo?: "porcentaje" | "fijo" | null | undefined;
        descuentoValor?: number | undefined;
    }, {
        operationId: string;
        descuentoTipo?: "porcentaje" | "fijo" | null | undefined;
        descuentoValor?: number | undefined;
    }>, "many">;
}, "strict", z.ZodTypeAny, {
    bodyTypeId: string;
    scope: "piece" | "global";
    operations: {
        operationId: string;
        descuentoTipo?: "porcentaje" | "fijo" | null | undefined;
        descuentoValor?: number | undefined;
    }[];
    configurationRevision: number;
    sizeId: string;
    pieceId?: string | undefined;
    positionId?: string | undefined;
    damageLevelId?: string | undefined;
}, {
    bodyTypeId: string;
    operations: {
        operationId: string;
        descuentoTipo?: "porcentaje" | "fijo" | null | undefined;
        descuentoValor?: number | undefined;
    }[];
    configurationRevision: number;
    sizeId: string;
    pieceId?: string | undefined;
    positionId?: string | undefined;
    scope?: "piece" | "global" | undefined;
    damageLevelId?: string | undefined;
}>, {
    bodyTypeId: string;
    scope: "piece" | "global";
    operations: {
        operationId: string;
        descuentoTipo?: "porcentaje" | "fijo" | null | undefined;
        descuentoValor?: number | undefined;
    }[];
    configurationRevision: number;
    sizeId: string;
    pieceId?: string | undefined;
    positionId?: string | undefined;
    damageLevelId?: string | undefined;
}, {
    bodyTypeId: string;
    operations: {
        operationId: string;
        descuentoTipo?: "porcentaje" | "fijo" | null | undefined;
        descuentoValor?: number | undefined;
    }[];
    configurationRevision: number;
    sizeId: string;
    pieceId?: string | undefined;
    positionId?: string | undefined;
    scope?: "piece" | "global" | undefined;
    damageLevelId?: string | undefined;
}>;
export declare const updateDpConfigurationSchema: z.ZodObject<{
    expectedRevision: z.ZodNumber;
    configuration: z.ZodEffects<z.ZodObject<{
        bodyTypes: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            label: z.ZodString;
            active: z.ZodBoolean;
            sizes: z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                label: z.ZodString;
                factor: z.ZodNumber;
                active: z.ZodBoolean;
            }, "strict", z.ZodTypeAny, {
                label: string;
                id: string;
                active: boolean;
                factor: number;
            }, {
                label: string;
                id: string;
                active: boolean;
                factor: number;
            }>, "many">;
        }, "strict", z.ZodTypeAny, {
            label: string;
            id: string;
            active: boolean;
            sizes: {
                label: string;
                id: string;
                active: boolean;
                factor: number;
            }[];
        }, {
            label: string;
            id: string;
            active: boolean;
            sizes: {
                label: string;
                id: string;
                active: boolean;
                factor: number;
            }[];
        }>, "many">;
        pieces: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            label: z.ZodString;
            active: z.ZodBoolean;
        }, "strict", z.ZodTypeAny, {
            label: string;
            id: string;
            active: boolean;
        }, {
            label: string;
            id: string;
            active: boolean;
        }>, "many">;
        rates: z.ZodArray<z.ZodObject<{
            bodyTypeId: z.ZodString;
            pieceId: z.ZodString;
            positionId: z.ZodString;
            positionLabel: z.ZodString;
            paintingFactor: z.ZodNumber;
            repairFactor: z.ZodNumber;
            dismantlingFactor: z.ZodNumber;
            active: z.ZodBoolean;
        }, "strict", z.ZodTypeAny, {
            active: boolean;
            bodyTypeId: string;
            pieceId: string;
            positionId: string;
            positionLabel: string;
            paintingFactor: number;
            repairFactor: number;
            dismantlingFactor: number;
        }, {
            active: boolean;
            bodyTypeId: string;
            pieceId: string;
            positionId: string;
            positionLabel: string;
            paintingFactor: number;
            repairFactor: number;
            dismantlingFactor: number;
        }>, "many">;
        tables: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            label: z.ZodString;
            formula: z.ZodEnum<["painting", "repair", "dismantling", "fixed"]>;
            basePrice: z.ZodNullable<z.ZodNumber>;
            active: z.ZodBoolean;
        }, "strict", z.ZodTypeAny, {
            label: string;
            id: string;
            active: boolean;
            formula: "painting" | "repair" | "dismantling" | "fixed";
            basePrice: number | null;
        }, {
            label: string;
            id: string;
            active: boolean;
            formula: "painting" | "repair" | "dismantling" | "fixed";
            basePrice: number | null;
        }>, "many">;
        operations: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            label: z.ZodString;
            scope: z.ZodEnum<["piece", "global", "additional"]>;
            tableId: z.ZodString;
            multiplier: z.ZodNullable<z.ZodNumber>;
            active: z.ZodBoolean;
            requiresDamage: z.ZodBoolean;
        }, "strict", z.ZodTypeAny, {
            label: string;
            id: string;
            active: boolean;
            scope: "piece" | "global" | "additional";
            tableId: string;
            multiplier: number | null;
            requiresDamage: boolean;
        }, {
            label: string;
            id: string;
            active: boolean;
            scope: "piece" | "global" | "additional";
            tableId: string;
            multiplier: number | null;
            requiresDamage: boolean;
        }>, "many">;
        damageLevels: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            label: z.ZodString;
            increment: z.ZodNumber;
            active: z.ZodBoolean;
        }, "strict", z.ZodTypeAny, {
            label: string;
            id: string;
            active: boolean;
            increment: number;
        }, {
            label: string;
            id: string;
            active: boolean;
            increment: number;
        }>, "many">;
        stages: z.ZodArray<z.ZodObject<{
            key: z.ZodEnum<["armador_desarme", "desab_prepar", "pintor", "armador_montaje", "detailer"]>;
            label: z.ZodString;
            specialties: z.ZodArray<z.ZodString, "many">;
        }, "strict", z.ZodTypeAny, {
            key: "armador_desarme" | "desab_prepar" | "pintor" | "armador_montaje" | "detailer";
            label: string;
            specialties: string[];
        }, {
            key: "armador_desarme" | "desab_prepar" | "pintor" | "armador_montaje" | "detailer";
            label: string;
            specialties: string[];
        }>, "many">;
    }, "strict", z.ZodTypeAny, {
        bodyTypes: {
            label: string;
            id: string;
            active: boolean;
            sizes: {
                label: string;
                id: string;
                active: boolean;
                factor: number;
            }[];
        }[];
        pieces: {
            label: string;
            id: string;
            active: boolean;
        }[];
        rates: {
            active: boolean;
            bodyTypeId: string;
            pieceId: string;
            positionId: string;
            positionLabel: string;
            paintingFactor: number;
            repairFactor: number;
            dismantlingFactor: number;
        }[];
        tables: {
            label: string;
            id: string;
            active: boolean;
            formula: "painting" | "repair" | "dismantling" | "fixed";
            basePrice: number | null;
        }[];
        operations: {
            label: string;
            id: string;
            active: boolean;
            scope: "piece" | "global" | "additional";
            tableId: string;
            multiplier: number | null;
            requiresDamage: boolean;
        }[];
        damageLevels: {
            label: string;
            id: string;
            active: boolean;
            increment: number;
        }[];
        stages: {
            key: "armador_desarme" | "desab_prepar" | "pintor" | "armador_montaje" | "detailer";
            label: string;
            specialties: string[];
        }[];
    }, {
        bodyTypes: {
            label: string;
            id: string;
            active: boolean;
            sizes: {
                label: string;
                id: string;
                active: boolean;
                factor: number;
            }[];
        }[];
        pieces: {
            label: string;
            id: string;
            active: boolean;
        }[];
        rates: {
            active: boolean;
            bodyTypeId: string;
            pieceId: string;
            positionId: string;
            positionLabel: string;
            paintingFactor: number;
            repairFactor: number;
            dismantlingFactor: number;
        }[];
        tables: {
            label: string;
            id: string;
            active: boolean;
            formula: "painting" | "repair" | "dismantling" | "fixed";
            basePrice: number | null;
        }[];
        operations: {
            label: string;
            id: string;
            active: boolean;
            scope: "piece" | "global" | "additional";
            tableId: string;
            multiplier: number | null;
            requiresDamage: boolean;
        }[];
        damageLevels: {
            label: string;
            id: string;
            active: boolean;
            increment: number;
        }[];
        stages: {
            key: "armador_desarme" | "desab_prepar" | "pintor" | "armador_montaje" | "detailer";
            label: string;
            specialties: string[];
        }[];
    }>, {
        bodyTypes: {
            label: string;
            id: string;
            active: boolean;
            sizes: {
                label: string;
                id: string;
                active: boolean;
                factor: number;
            }[];
        }[];
        pieces: {
            label: string;
            id: string;
            active: boolean;
        }[];
        rates: {
            active: boolean;
            bodyTypeId: string;
            pieceId: string;
            positionId: string;
            positionLabel: string;
            paintingFactor: number;
            repairFactor: number;
            dismantlingFactor: number;
        }[];
        tables: {
            label: string;
            id: string;
            active: boolean;
            formula: "painting" | "repair" | "dismantling" | "fixed";
            basePrice: number | null;
        }[];
        operations: {
            label: string;
            id: string;
            active: boolean;
            scope: "piece" | "global" | "additional";
            tableId: string;
            multiplier: number | null;
            requiresDamage: boolean;
        }[];
        damageLevels: {
            label: string;
            id: string;
            active: boolean;
            increment: number;
        }[];
        stages: {
            key: "armador_desarme" | "desab_prepar" | "pintor" | "armador_montaje" | "detailer";
            label: string;
            specialties: string[];
        }[];
    }, {
        bodyTypes: {
            label: string;
            id: string;
            active: boolean;
            sizes: {
                label: string;
                id: string;
                active: boolean;
                factor: number;
            }[];
        }[];
        pieces: {
            label: string;
            id: string;
            active: boolean;
        }[];
        rates: {
            active: boolean;
            bodyTypeId: string;
            pieceId: string;
            positionId: string;
            positionLabel: string;
            paintingFactor: number;
            repairFactor: number;
            dismantlingFactor: number;
        }[];
        tables: {
            label: string;
            id: string;
            active: boolean;
            formula: "painting" | "repair" | "dismantling" | "fixed";
            basePrice: number | null;
        }[];
        operations: {
            label: string;
            id: string;
            active: boolean;
            scope: "piece" | "global" | "additional";
            tableId: string;
            multiplier: number | null;
            requiresDamage: boolean;
        }[];
        damageLevels: {
            label: string;
            id: string;
            active: boolean;
            increment: number;
        }[];
        stages: {
            key: "armador_desarme" | "desab_prepar" | "pintor" | "armador_montaje" | "detailer";
            label: string;
            specialties: string[];
        }[];
    }>;
}, "strict", z.ZodTypeAny, {
    expectedRevision: number;
    configuration: {
        bodyTypes: {
            label: string;
            id: string;
            active: boolean;
            sizes: {
                label: string;
                id: string;
                active: boolean;
                factor: number;
            }[];
        }[];
        pieces: {
            label: string;
            id: string;
            active: boolean;
        }[];
        rates: {
            active: boolean;
            bodyTypeId: string;
            pieceId: string;
            positionId: string;
            positionLabel: string;
            paintingFactor: number;
            repairFactor: number;
            dismantlingFactor: number;
        }[];
        tables: {
            label: string;
            id: string;
            active: boolean;
            formula: "painting" | "repair" | "dismantling" | "fixed";
            basePrice: number | null;
        }[];
        operations: {
            label: string;
            id: string;
            active: boolean;
            scope: "piece" | "global" | "additional";
            tableId: string;
            multiplier: number | null;
            requiresDamage: boolean;
        }[];
        damageLevels: {
            label: string;
            id: string;
            active: boolean;
            increment: number;
        }[];
        stages: {
            key: "armador_desarme" | "desab_prepar" | "pintor" | "armador_montaje" | "detailer";
            label: string;
            specialties: string[];
        }[];
    };
}, {
    expectedRevision: number;
    configuration: {
        bodyTypes: {
            label: string;
            id: string;
            active: boolean;
            sizes: {
                label: string;
                id: string;
                active: boolean;
                factor: number;
            }[];
        }[];
        pieces: {
            label: string;
            id: string;
            active: boolean;
        }[];
        rates: {
            active: boolean;
            bodyTypeId: string;
            pieceId: string;
            positionId: string;
            positionLabel: string;
            paintingFactor: number;
            repairFactor: number;
            dismantlingFactor: number;
        }[];
        tables: {
            label: string;
            id: string;
            active: boolean;
            formula: "painting" | "repair" | "dismantling" | "fixed";
            basePrice: number | null;
        }[];
        operations: {
            label: string;
            id: string;
            active: boolean;
            scope: "piece" | "global" | "additional";
            tableId: string;
            multiplier: number | null;
            requiresDamage: boolean;
        }[];
        damageLevels: {
            label: string;
            id: string;
            active: boolean;
            increment: number;
        }[];
        stages: {
            key: "armador_desarme" | "desab_prepar" | "pintor" | "armador_montaje" | "detailer";
            label: string;
            specialties: string[];
        }[];
    };
}>;
export declare const dpConfigurationRecordSchema: z.ZodObject<{
    revision: z.ZodNumber;
    configuration: z.ZodEffects<z.ZodObject<{
        bodyTypes: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            label: z.ZodString;
            active: z.ZodBoolean;
            sizes: z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                label: z.ZodString;
                factor: z.ZodNumber;
                active: z.ZodBoolean;
            }, "strict", z.ZodTypeAny, {
                label: string;
                id: string;
                active: boolean;
                factor: number;
            }, {
                label: string;
                id: string;
                active: boolean;
                factor: number;
            }>, "many">;
        }, "strict", z.ZodTypeAny, {
            label: string;
            id: string;
            active: boolean;
            sizes: {
                label: string;
                id: string;
                active: boolean;
                factor: number;
            }[];
        }, {
            label: string;
            id: string;
            active: boolean;
            sizes: {
                label: string;
                id: string;
                active: boolean;
                factor: number;
            }[];
        }>, "many">;
        pieces: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            label: z.ZodString;
            active: z.ZodBoolean;
        }, "strict", z.ZodTypeAny, {
            label: string;
            id: string;
            active: boolean;
        }, {
            label: string;
            id: string;
            active: boolean;
        }>, "many">;
        rates: z.ZodArray<z.ZodObject<{
            bodyTypeId: z.ZodString;
            pieceId: z.ZodString;
            positionId: z.ZodString;
            positionLabel: z.ZodString;
            paintingFactor: z.ZodNumber;
            repairFactor: z.ZodNumber;
            dismantlingFactor: z.ZodNumber;
            active: z.ZodBoolean;
        }, "strict", z.ZodTypeAny, {
            active: boolean;
            bodyTypeId: string;
            pieceId: string;
            positionId: string;
            positionLabel: string;
            paintingFactor: number;
            repairFactor: number;
            dismantlingFactor: number;
        }, {
            active: boolean;
            bodyTypeId: string;
            pieceId: string;
            positionId: string;
            positionLabel: string;
            paintingFactor: number;
            repairFactor: number;
            dismantlingFactor: number;
        }>, "many">;
        tables: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            label: z.ZodString;
            formula: z.ZodEnum<["painting", "repair", "dismantling", "fixed"]>;
            basePrice: z.ZodNullable<z.ZodNumber>;
            active: z.ZodBoolean;
        }, "strict", z.ZodTypeAny, {
            label: string;
            id: string;
            active: boolean;
            formula: "painting" | "repair" | "dismantling" | "fixed";
            basePrice: number | null;
        }, {
            label: string;
            id: string;
            active: boolean;
            formula: "painting" | "repair" | "dismantling" | "fixed";
            basePrice: number | null;
        }>, "many">;
        operations: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            label: z.ZodString;
            scope: z.ZodEnum<["piece", "global", "additional"]>;
            tableId: z.ZodString;
            multiplier: z.ZodNullable<z.ZodNumber>;
            active: z.ZodBoolean;
            requiresDamage: z.ZodBoolean;
        }, "strict", z.ZodTypeAny, {
            label: string;
            id: string;
            active: boolean;
            scope: "piece" | "global" | "additional";
            tableId: string;
            multiplier: number | null;
            requiresDamage: boolean;
        }, {
            label: string;
            id: string;
            active: boolean;
            scope: "piece" | "global" | "additional";
            tableId: string;
            multiplier: number | null;
            requiresDamage: boolean;
        }>, "many">;
        damageLevels: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            label: z.ZodString;
            increment: z.ZodNumber;
            active: z.ZodBoolean;
        }, "strict", z.ZodTypeAny, {
            label: string;
            id: string;
            active: boolean;
            increment: number;
        }, {
            label: string;
            id: string;
            active: boolean;
            increment: number;
        }>, "many">;
        stages: z.ZodArray<z.ZodObject<{
            key: z.ZodEnum<["armador_desarme", "desab_prepar", "pintor", "armador_montaje", "detailer"]>;
            label: z.ZodString;
            specialties: z.ZodArray<z.ZodString, "many">;
        }, "strict", z.ZodTypeAny, {
            key: "armador_desarme" | "desab_prepar" | "pintor" | "armador_montaje" | "detailer";
            label: string;
            specialties: string[];
        }, {
            key: "armador_desarme" | "desab_prepar" | "pintor" | "armador_montaje" | "detailer";
            label: string;
            specialties: string[];
        }>, "many">;
    }, "strict", z.ZodTypeAny, {
        bodyTypes: {
            label: string;
            id: string;
            active: boolean;
            sizes: {
                label: string;
                id: string;
                active: boolean;
                factor: number;
            }[];
        }[];
        pieces: {
            label: string;
            id: string;
            active: boolean;
        }[];
        rates: {
            active: boolean;
            bodyTypeId: string;
            pieceId: string;
            positionId: string;
            positionLabel: string;
            paintingFactor: number;
            repairFactor: number;
            dismantlingFactor: number;
        }[];
        tables: {
            label: string;
            id: string;
            active: boolean;
            formula: "painting" | "repair" | "dismantling" | "fixed";
            basePrice: number | null;
        }[];
        operations: {
            label: string;
            id: string;
            active: boolean;
            scope: "piece" | "global" | "additional";
            tableId: string;
            multiplier: number | null;
            requiresDamage: boolean;
        }[];
        damageLevels: {
            label: string;
            id: string;
            active: boolean;
            increment: number;
        }[];
        stages: {
            key: "armador_desarme" | "desab_prepar" | "pintor" | "armador_montaje" | "detailer";
            label: string;
            specialties: string[];
        }[];
    }, {
        bodyTypes: {
            label: string;
            id: string;
            active: boolean;
            sizes: {
                label: string;
                id: string;
                active: boolean;
                factor: number;
            }[];
        }[];
        pieces: {
            label: string;
            id: string;
            active: boolean;
        }[];
        rates: {
            active: boolean;
            bodyTypeId: string;
            pieceId: string;
            positionId: string;
            positionLabel: string;
            paintingFactor: number;
            repairFactor: number;
            dismantlingFactor: number;
        }[];
        tables: {
            label: string;
            id: string;
            active: boolean;
            formula: "painting" | "repair" | "dismantling" | "fixed";
            basePrice: number | null;
        }[];
        operations: {
            label: string;
            id: string;
            active: boolean;
            scope: "piece" | "global" | "additional";
            tableId: string;
            multiplier: number | null;
            requiresDamage: boolean;
        }[];
        damageLevels: {
            label: string;
            id: string;
            active: boolean;
            increment: number;
        }[];
        stages: {
            key: "armador_desarme" | "desab_prepar" | "pintor" | "armador_montaje" | "detailer";
            label: string;
            specialties: string[];
        }[];
    }>, {
        bodyTypes: {
            label: string;
            id: string;
            active: boolean;
            sizes: {
                label: string;
                id: string;
                active: boolean;
                factor: number;
            }[];
        }[];
        pieces: {
            label: string;
            id: string;
            active: boolean;
        }[];
        rates: {
            active: boolean;
            bodyTypeId: string;
            pieceId: string;
            positionId: string;
            positionLabel: string;
            paintingFactor: number;
            repairFactor: number;
            dismantlingFactor: number;
        }[];
        tables: {
            label: string;
            id: string;
            active: boolean;
            formula: "painting" | "repair" | "dismantling" | "fixed";
            basePrice: number | null;
        }[];
        operations: {
            label: string;
            id: string;
            active: boolean;
            scope: "piece" | "global" | "additional";
            tableId: string;
            multiplier: number | null;
            requiresDamage: boolean;
        }[];
        damageLevels: {
            label: string;
            id: string;
            active: boolean;
            increment: number;
        }[];
        stages: {
            key: "armador_desarme" | "desab_prepar" | "pintor" | "armador_montaje" | "detailer";
            label: string;
            specialties: string[];
        }[];
    }, {
        bodyTypes: {
            label: string;
            id: string;
            active: boolean;
            sizes: {
                label: string;
                id: string;
                active: boolean;
                factor: number;
            }[];
        }[];
        pieces: {
            label: string;
            id: string;
            active: boolean;
        }[];
        rates: {
            active: boolean;
            bodyTypeId: string;
            pieceId: string;
            positionId: string;
            positionLabel: string;
            paintingFactor: number;
            repairFactor: number;
            dismantlingFactor: number;
        }[];
        tables: {
            label: string;
            id: string;
            active: boolean;
            formula: "painting" | "repair" | "dismantling" | "fixed";
            basePrice: number | null;
        }[];
        operations: {
            label: string;
            id: string;
            active: boolean;
            scope: "piece" | "global" | "additional";
            tableId: string;
            multiplier: number | null;
            requiresDamage: boolean;
        }[];
        damageLevels: {
            label: string;
            id: string;
            active: boolean;
            increment: number;
        }[];
        stages: {
            key: "armador_desarme" | "desab_prepar" | "pintor" | "armador_montaje" | "detailer";
            label: string;
            specialties: string[];
        }[];
    }>;
    updatedAt: z.ZodString;
    lastEditor: z.ZodNullable<z.ZodObject<{
        id: z.ZodNumber;
        nombre: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        id: number;
        nombre: string;
    }, {
        id: number;
        nombre: string;
    }>>;
}, "strip", z.ZodTypeAny, {
    configuration: {
        bodyTypes: {
            label: string;
            id: string;
            active: boolean;
            sizes: {
                label: string;
                id: string;
                active: boolean;
                factor: number;
            }[];
        }[];
        pieces: {
            label: string;
            id: string;
            active: boolean;
        }[];
        rates: {
            active: boolean;
            bodyTypeId: string;
            pieceId: string;
            positionId: string;
            positionLabel: string;
            paintingFactor: number;
            repairFactor: number;
            dismantlingFactor: number;
        }[];
        tables: {
            label: string;
            id: string;
            active: boolean;
            formula: "painting" | "repair" | "dismantling" | "fixed";
            basePrice: number | null;
        }[];
        operations: {
            label: string;
            id: string;
            active: boolean;
            scope: "piece" | "global" | "additional";
            tableId: string;
            multiplier: number | null;
            requiresDamage: boolean;
        }[];
        damageLevels: {
            label: string;
            id: string;
            active: boolean;
            increment: number;
        }[];
        stages: {
            key: "armador_desarme" | "desab_prepar" | "pintor" | "armador_montaje" | "detailer";
            label: string;
            specialties: string[];
        }[];
    };
    revision: number;
    updatedAt: string;
    lastEditor: {
        id: number;
        nombre: string;
    } | null;
}, {
    configuration: {
        bodyTypes: {
            label: string;
            id: string;
            active: boolean;
            sizes: {
                label: string;
                id: string;
                active: boolean;
                factor: number;
            }[];
        }[];
        pieces: {
            label: string;
            id: string;
            active: boolean;
        }[];
        rates: {
            active: boolean;
            bodyTypeId: string;
            pieceId: string;
            positionId: string;
            positionLabel: string;
            paintingFactor: number;
            repairFactor: number;
            dismantlingFactor: number;
        }[];
        tables: {
            label: string;
            id: string;
            active: boolean;
            formula: "painting" | "repair" | "dismantling" | "fixed";
            basePrice: number | null;
        }[];
        operations: {
            label: string;
            id: string;
            active: boolean;
            scope: "piece" | "global" | "additional";
            tableId: string;
            multiplier: number | null;
            requiresDamage: boolean;
        }[];
        damageLevels: {
            label: string;
            id: string;
            active: boolean;
            increment: number;
        }[];
        stages: {
            key: "armador_desarme" | "desab_prepar" | "pintor" | "armador_montaje" | "detailer";
            label: string;
            specialties: string[];
        }[];
    };
    revision: number;
    updatedAt: string;
    lastEditor: {
        id: number;
        nombre: string;
    } | null;
}>;
export type DpConfiguration = z.infer<typeof dpConfigurationSchema>;
export type DpStageDefinition = z.infer<typeof dpStageDefinitionSchema>;
export type DpQuoteInput = z.infer<typeof dpQuoteInputSchema>;
export type DpQuoteRequest = z.input<typeof dpQuoteInputSchema>;
export type UpdateDpConfigurationInput = z.infer<typeof updateDpConfigurationSchema>;
export type DpConfigurationRecord = z.infer<typeof dpConfigurationRecordSchema>;
export interface DpQuoteLine {
    operationId: string;
    label: string;
    tableId: string;
    formula: (typeof DP_PRICE_FORMULAS)[number];
    basePrice: number;
    vehicleFactor: number;
    pieceFactor: number;
    damageIncrement: number;
    multiplier: number;
    bruto: number;
    descuentoMonto: number;
    subtotal: number;
}
export interface DpWorkQuote {
    configurationRevision: number;
    selection: DpQuoteInput;
    bodyTypeLabel: string;
    sizeLabel: string;
    pieceLabel: string | null;
    positionLabel: string | null;
    damageLabel: string | null;
    vehicleFactor: number;
    lines: DpQuoteLine[];
    subtotal: number;
    descuentoOperaciones: number;
    precioUnitario: number;
    neto: number;
    iva: number;
    total: number;
    stages: DpStageDefinition[];
}
