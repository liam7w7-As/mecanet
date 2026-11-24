export const CATALOG_TYPES = ['parte', 'estandar', 'especifico'];
export const CATALOG_DIVISIONS = ['DP', 'ACC', 'MEC'];
export const CATALOG_SUBTYPES = [
    'servicio_dp',
    'en_stock',
    'a_pedido',
    'estandar',
    'especifico',
];
export const CATALOG_DIVISION_SUBTYPES = {
    DP: ['servicio_dp'],
    ACC: ['en_stock', 'a_pedido'],
    MEC: ['estandar', 'especifico'],
};
/** Resolve only classification. PATCH callers must supply the locked current row. */
export function resolveCatalogClassification(input, current) {
    const legacyDivision = (tipo) => tipo === 'parte' ? 'ACC' : 'MEC';
    // Older ORM callers only supplied tipo. The new database default pair
    // MEC/estandar does not reclassify those parts or specific services. Normalize
    // the current row before merging a PATCH; explicit new classifications win.
    const previous = current?.division === 'MEC' && current.subtipo === 'estandar' &&
        current.tipo !== 'estandar'
        ? {
            tipo: current.tipo,
            division: legacyDivision(current.tipo),
            subtipo: current.tipo === 'parte' ? 'en_stock' : 'especifico',
        }
        : current;
    const subtypeDivision = (subtipo) => subtipo === 'servicio_dp' ? 'DP' : ['en_stock', 'a_pedido'].includes(subtipo) ? 'ACC' : 'MEC';
    const typeChanged = input.tipo !== undefined && input.tipo !== previous?.tipo;
    const division = input.division ??
        (!previous && input.subtipo ? subtypeDivision(input.subtipo) :
            typeChanged ? legacyDivision(input.tipo) : previous?.division) ??
        (input.subtipo ? subtypeDivision(input.subtipo) : legacyDivision(input.tipo ?? 'estandar'));
    const keepSubtype = previous?.division === division && !typeChanged;
    const subtipo = input.subtipo ?? (keepSubtype ? previous.subtipo : undefined) ??
        (division === 'DP' ? 'servicio_dp' : division === 'ACC' ? 'en_stock' :
            input.tipo === 'especifico' ? 'especifico' : 'estandar');
    const tipo = division === 'ACC' ? 'parte' :
        division === 'MEC' && subtipo === 'especifico' ? 'especifico' : 'estandar';
    return { division, subtipo, tipo };
}
export const DP_STAGE_KEYS = [
    'armador_desarme',
    'desab_prepar',
    'pintor',
    'armador_montaje',
    'detailer',
];
export const DP_STAGE_LABELS = {
    armador_desarme: 'Armador (Desarme)',
    desab_prepar: 'Desab / Prepar',
    pintor: 'Pintor',
    armador_montaje: 'Armador (Montaje)',
    detailer: 'Detailer',
};
export const DP_STAGE_INDEXES = {
    armador_desarme: 1,
    desab_prepar: 2,
    pintor: 3,
    armador_montaje: 4,
    detailer: 5,
};
/** Specialties within the existing operating role; these are not auth roles. */
export const DP_STAGE_SPECIALTIES = {
    armador_desarme: ['armador'],
    desab_prepar: ['desabollador', 'preparador'],
    pintor: ['pintor'],
    armador_montaje: ['armador'],
    detailer: ['detailer'],
};
