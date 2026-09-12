import type { QueryInterface } from 'sequelize';

type CatalogType = 'parte' | 'estandar' | 'especifico';

interface CatalogSeedItem {
  tipo: CatalogType;
  codigo: string | null;
  nombre: string;
  descripcion: string | null;
  precio: number;
  stock: number;
}

const CATALOG_ITEMS_SEED: CatalogSeedItem[] = [
  // Catálogo estándar (6 servicios)
  {
    tipo: 'estandar',
    codigo: null,
    nombre: 'Cambio de aceite',
    descripcion: 'Servicio estándar de cambio de aceite para motor',
    precio: 25000,
    stock: 0,
  },
  {
    tipo: 'estandar',
    codigo: null,
    nombre: 'Cambio de filtro de aire',
    descripcion: 'Reemplazo e instalación de filtro de aire',
    precio: 12000,
    stock: 0,
  },
  {
    tipo: 'estandar',
    codigo: null,
    nombre: 'Cambio de filtro de combustible',
    descripcion: 'Reemplazo e instalación de filtro de combustible',
    precio: 18000,
    stock: 0,
  },
  {
    tipo: 'estandar',
    codigo: null,
    nombre: 'Alineación y balanceo',
    descripcion: 'Alineación computarizada y balanceo de 4 ruedas',
    precio: 35000,
    stock: 0,
  },
  {
    tipo: 'estandar',
    codigo: null,
    nombre: 'Revisión de frenos',
    descripcion: 'Inspección técnica de pastillas, discos y líquido de freno',
    precio: 20000,
    stock: 0,
  },
  {
    tipo: 'estandar',
    codigo: null,
    nombre: 'Cambio de bujías',
    descripcion: 'Reemplazo de bujías de encendido del motor',
    precio: 28000,
    stock: 0,
  },

  // Catálogo partes (5 repuestos con stock)
  {
    tipo: 'parte',
    codigo: 'FLT-ACE-001',
    nombre: 'Filtro de aceite',
    descripcion: 'Filtro de aceite de alto rendimiento',
    precio: 8500,
    stock: 20,
  },
  {
    tipo: 'parte',
    codigo: 'FLT-AIR-001',
    nombre: 'Filtro de aire',
    descripcion: 'Filtro de aire para motor liviano',
    precio: 12000,
    stock: 15,
  },
  {
    tipo: 'parte',
    codigo: 'FLT-COM-001',
    nombre: 'Filtro de combustible',
    descripcion: 'Filtro de combustible estándar',
    precio: 14000,
    stock: 10,
  },
  {
    tipo: 'parte',
    codigo: 'BUI-NGK-001',
    nombre: 'Bujía NGK estándar',
    descripcion: 'Bujía de encendido NGK estándar',
    precio: 6500,
    stock: 30,
  },
  {
    tipo: 'parte',
    codigo: 'ACE-10W40-1L',
    nombre: 'Aceite 10W40 (1L)',
    descripcion: 'Aceite semi-sintético 10W40 envase 1 Litro',
    precio: 9000,
    stock: 50,
  },

  // Catálogo específicos (3 servicios personalizados)
  {
    tipo: 'especifico',
    codigo: null,
    nombre: 'Diagnóstico computarizado',
    descripcion: 'Escaneo electrónico y diagnóstico por computadora OBD-II',
    precio: 30000,
    stock: 0,
  },
  {
    tipo: 'especifico',
    codigo: null,
    nombre: 'Revisión pre-compra',
    descripcion: 'Inspección integral mecánica, estructural y eléctrica',
    precio: 45000,
    stock: 0,
  },
  {
    tipo: 'especifico',
    codigo: null,
    nombre: 'Reparación eléctrica',
    descripcion: 'Diagnóstico y reparación de circuitos eléctricos y luces',
    precio: 40000,
    stock: 0,
  },
];

export async function up(queryInterface: QueryInterface): Promise<void> {
  const now = new Date();

  // Consultar ítems existentes para asegurar idempotencia
  const [existingItems] = (await queryInterface.sequelize.query(
    'SELECT codigo, nombre FROM catalog_items;',
  )) as [{ codigo: string | null; nombre: string }[], unknown];

  const existingCodes = new Set(existingItems.filter((i) => i.codigo).map((i) => i.codigo));
  const existingNames = new Set(existingItems.map((i) => i.nombre));

  const toInsert = CATALOG_ITEMS_SEED.filter((item) => {
    if (item.codigo && existingCodes.has(item.codigo)) return false;
    if (existingNames.has(item.nombre)) return false;
    return true;
  }).map((item) => ({
    ...item,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  }));

  if (toInsert.length > 0) {
    await queryInterface.bulkInsert('catalog_items', toInsert);
  }
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  const codigos = CATALOG_ITEMS_SEED.filter((i) => i.codigo).map((i) => i.codigo);
  const nombres = CATALOG_ITEMS_SEED.map((i) => i.nombre);

  await queryInterface.sequelize.query(
    'DELETE FROM catalog_items WHERE codigo IN (:codigos) OR nombre IN (:nombres);',
    {
      replacements: { codigos, nombres },
    },
  );
}
