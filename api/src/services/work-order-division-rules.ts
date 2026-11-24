import type { CatalogDivision, CatalogSubtype, CatalogType } from '@unithor/shared';


interface DivisionInput {
  division?: CatalogDivision | null;
  subtipo?: CatalogSubtype | null;
  tipoLinea?: CatalogType;
  tipo?: CatalogType;
  esAPedido?: boolean;
}

/** Historical callers may send only tipoLinea. Explicit metadata wins over catalog defaults. */
export function normalizeDivisionMetadata(input: DivisionInput, catalog?: DivisionInput | null): {
  division: CatalogDivision; subtipo: CatalogSubtype; esAPedido: boolean;
} {
  const tipo = input.tipoLinea ?? input.tipo ?? catalog?.tipoLinea ?? catalog?.tipo;
  const catalogType = catalog?.tipoLinea ?? catalog?.tipo;
  // Older seeders/integrations can still create a part with the model's MEC default.
  const catalogDivision = catalogType === 'parte' ? 'ACC' : catalog?.division;
  const division = input.division ?? catalogDivision ?? (tipo === 'parte' ? 'ACC' : 'MEC');
  const requested = input.subtipo ?? catalog?.subtipo;
  const subtipo: CatalogSubtype = division === 'DP' ? 'servicio_dp'
    : division === 'ACC' ? (requested === 'a_pedido' || input.esAPedido === true ? 'a_pedido' : 'en_stock')
      : (requested === 'especifico' || tipo === 'especifico' ? 'especifico' : 'estandar');
  return { division, subtipo, esAPedido: division === 'ACC' && subtipo === 'a_pedido' };
}
