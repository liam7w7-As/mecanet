export interface ImportColumnDefinition {
  key: string;
  header: string;
  required: boolean;
  description: string;
  example: string | number | null;
  aliases: readonly string[];
  width?: number;
  /** Valores sugeridos; se usan para la lista desplegable de la plantilla. */
  list?: readonly string[];
}

const IMPORT_ID_COLUMN: ImportColumnDefinition = {
  key: 'id',
  header: 'ID',
  required: false,
  description:
    'ID estable opcional del registro existente. Tiene prioridad sobre las claves naturales. Un ID desconocido o eliminado genera conflicto. Sin ID, se identifica por patente o código; solo se crea cuando no existe una coincidencia.',
  example: null,
  aliases: [
    'id',
    'id registro',
    'identificador',
    'record id',
    'id vehiculo',
    'id flota',
    'id item',
    'id catalogo',
  ],
  width: 12,
};

export const CATALOG_IMPORT_COLUMNS: readonly ImportColumnDefinition[] = [
  IMPORT_ID_COLUMN,
  {
    key: 'tipo',
    header: 'Tipo',
    required: false,
    description:
      'Repuesto, Servicio estándar o Servicio específico. Si se omite, se deduce por el código.',
    example: 'Repuesto',
    aliases: ['tipo', 'tipo item', 'tipo de item', 'categoria', 'rubro'],
    width: 20,
    list: ['Repuesto', 'Servicio estándar', 'Servicio específico'],
  },
  {
    key: 'codigo',
    header: 'Código',
    required: false,
    description: 'Código único del repuesto o servicio. Se normaliza a mayúsculas.',
    example: 'REP-001',
    aliases: [
      'codigo',
      'sku',
      'part number',
      'n parte',
      'nro parte',
      'numero parte',
      'referencia',
      'codigo repuesto',
    ],
    width: 18,
  },
  {
    key: 'nombre',
    header: 'Nombre',
    required: true,
    description: 'Nombre visible en órdenes y cotizaciones.',
    example: 'Filtro de aceite',
    aliases: ['nombre', 'producto', 'item', 'servicio', 'repuesto', 'detalle', 'descripcion'],
    width: 34,
  },
  {
    key: 'descripcion',
    header: 'Descripción',
    required: false,
    description: 'Detalle técnico o comercial opcional.',
    example: 'Filtro de aceite para motor diésel',
    aliases: ['descripcion', 'detalle largo', 'observacion', 'notas'],
    width: 40,
  },
  {
    key: 'unidadMedida',
    header: 'Unidad de medida',
    required: false,
    description: 'Unidad, Litro, Mililitro, Kilogramo, Juego o Servicio.',
    example: 'Unidad',
    aliases: ['unidad medida', 'unidad de medida', 'unidad', 'um', 'medida'],
    width: 18,
    list: ['Unidad', 'Litro', 'Mililitro', 'Kilogramo', 'Juego', 'Servicio'],
  },
  {
    key: 'precio',
    header: 'Precio',
    required: false,
    description: 'Precio de venta en pesos. Acepta $1.234 o 1234.',
    example: 12_990,
    aliases: ['precio', 'valor', 'p venta', 'precio venta', 'precio unitario', 'pvp', 'neto'],
    width: 14,
  },
  {
    key: 'stock',
    header: 'Stock',
    required: false,
    description: 'Cantidad disponible. Solo aplica a repuestos.',
    example: 10,
    aliases: ['stock', 'cantidad', 'existencia', 'inventario', 'qty'],
    width: 12,
  },
  {
    key: 'stockMinimo',
    header: 'Stock mínimo',
    required: false,
    description: 'Nivel mínimo antes de alertar. Solo aplica a repuestos.',
    example: 3,
    aliases: ['stock minimo', 'minimo', 'punto de pedido', 'stock critico'],
    width: 14,
  },
  {
    key: 'horasHombreEstandar',
    header: 'Horas hombre estándar',
    required: false,
    description: 'Horas estimadas por unidad. Solo aplica a servicios.',
    example: 0.5,
    aliases: [
      'horas hombre',
      'horas hombre estandar',
      'horas hombre estándar',
      'hh',
      'horas',
      'tiempo estimado',
    ],
    width: 20,
  },
];

const VEHICLE_BASE_COLUMNS: readonly ImportColumnDefinition[] = [
  {
    key: 'patente',
    header: 'Patente',
    required: false,
    description:
      'Obligatoria al crear. Patente con o sin guion; se normaliza automáticamente. En actualizaciones por ID, una celda vacía conserva la patente.',
    example: 'AB1234',
    aliases: ['patente', 'placa', 'n patente', 'nro patente', 'numero patente', 'ppu'],
    width: 14,
  },
  {
    key: 'marca',
    header: 'Marca',
    required: false,
    description: 'Marca del vehículo.',
    example: 'Toyota',
    aliases: ['marca'],
    width: 16,
  },
  {
    key: 'modelo',
    header: 'Modelo',
    required: false,
    description: 'Modelo del vehículo.',
    example: 'Hilux',
    aliases: ['modelo'],
    width: 18,
  },
  {
    key: 'ano',
    header: 'Año',
    required: false,
    description: 'Año de fabricación.',
    example: 2022,
    aliases: ['ano', 'año', 'year', 'modelo ano', 'ano modelo'],
    width: 10,
  },
  {
    key: 'color',
    header: 'Color',
    required: false,
    description: 'Color del vehículo.',
    example: 'Blanco',
    aliases: ['color'],
    width: 12,
  },
  {
    key: 'vinChasis',
    header: 'VIN / Chasis',
    required: false,
    description: 'Número de VIN o chasis.',
    example: 'MRO1234567890',
    aliases: ['vin', 'chasis', 'vin chasis', 'n chasis', 'numero chasis'],
    width: 20,
  },
  {
    key: 'motor',
    header: 'Motor',
    required: false,
    description: 'Número o identificación del motor.',
    example: '2GD-123456',
    aliases: ['motor', 'n motor', 'numero motor'],
    width: 16,
  },
  {
    key: 'kilometraje',
    header: 'Kilometraje',
    required: false,
    description: 'Kilómetros recorridos.',
    example: 45_200,
    aliases: ['kilometraje', 'kilometros', 'kms', 'km', 'odometro'],
    width: 14,
  },
  {
    key: 'combustible',
    header: 'Combustible',
    required: false,
    description: 'Bencina, Diésel, Híbrido, Eléctrico o Gas.',
    example: 'Diésel',
    aliases: ['combustible', 'tipo combustible'],
    width: 14,
    list: ['Bencina', 'Diésel', 'Híbrido', 'Eléctrico', 'Gas'],
  },
  {
    key: 'transmision',
    header: 'Transmisión',
    required: false,
    description: 'Manual, Automática o CVT.',
    example: 'Manual',
    aliases: ['transmision', 'caja', 'tipo transmision'],
    width: 14,
    list: ['Manual', 'Automática', 'CVT'],
  },
];

export const VEHICLE_IMPORT_COLUMNS: readonly ImportColumnDefinition[] = [
  IMPORT_ID_COLUMN,
  ...VEHICLE_BASE_COLUMNS,
  {
    key: 'esExtranjera',
    header: 'Patente extranjera',
    required: false,
    description:
      'Sí o No (también 1 o 0). Sí permite patentes extranjeras. Vacío conserva el tipo de patente existente; al crear se asume chilena.',
    example: 'No',
    aliases: [
      'patente extranjera',
      'es extranjera',
      'extranjera',
      'placa extranjera',
      'foreign plate',
    ],
    width: 20,
    list: ['Sí', 'No'],
  },
  {
    key: 'propietario',
    header: 'Propietario',
    required: false,
    description:
      'Nombre del cliente, identificado primero por RUT y luego por nombre. Si falta, se crea con permiso comercial.create o taller.create. Nunca se restauran clientes eliminados ni se editan sus datos; vacío conserva el cliente actual.',
    example: 'Carlos Muñoz',
    aliases: ['propietario', 'cliente', 'dueno', 'nombre propietario', 'nombre cliente'],
    width: 28,
  },
  {
    key: 'rutPropietario',
    header: 'RUT propietario',
    required: false,
    description: 'RUT del cliente. Es la mejor clave para evitar duplicados.',
    example: '12.345.678-5',
    aliases: ['rut', 'rut propietario', 'rut cliente', 'rut dueno'],
    width: 18,
  },
  {
    key: 'telefonoPropietario',
    header: 'Teléfono propietario',
    required: false,
    description: 'Teléfono de contacto del cliente.',
    example: '+56 9 1234 5678',
    aliases: ['telefono', 'telefono propietario', 'fono', 'celular', 'contacto'],
    width: 20,
  },
  {
    key: 'emailPropietario',
    header: 'Email propietario',
    required: false,
    description: 'Correo electrónico del cliente.',
    example: 'cliente@correo.cl',
    aliases: ['email', 'correo', 'e mail', 'email propietario', 'correo propietario'],
    width: 26,
  },
];

export const FLEET_IMPORT_COLUMNS: readonly ImportColumnDefinition[] = [
  IMPORT_ID_COLUMN,
  {
    key: 'patente',
    header: 'Patente',
    required: false,
    description:
      'Patente chilena obligatoria al crear. Se identifica primero por ID, luego por patente o código interno. Vacío conserva la patente existente.',
    example: 'FLTA01',
    aliases: ['patente', 'placa', 'n patente', 'nro patente', 'numero patente', 'ppu'],
    width: 14,
  },
  {
    key: 'codigoInterno',
    header: 'Código interno',
    required: false,
    description: 'Código único de la flota.',
    example: 'FL-001',
    aliases: ['codigo interno', 'codigo', 'n interno', 'numero interno', 'cod flota'],
    width: 16,
  },
  ...VEHICLE_BASE_COLUMNS.slice(1),
  {
    key: 'estadoOperativo',
    header: 'Estado operativo',
    required: false,
    description:
      'Disponible, En mantención, Fuera de servicio o Dado de baja. Baja y Retirado también se interpretan como Dado de baja.',
    example: 'Disponible',
    aliases: ['estado', 'estado operativo', 'situacion', 'estado vehiculo'],
    width: 18,
    list: ['Disponible', 'En mantención', 'Fuera de servicio', 'Dado de baja'],
  },
  {
    key: 'sucursal',
    header: 'Sucursal',
    required: false,
    description: 'Sucursal, base u oficina donde opera.',
    example: 'Casa Central',
    aliases: ['sucursal', 'oficina', 'base', 'ubicacion', 'ciudad'],
    width: 18,
  },
  {
    key: 'responsable',
    header: 'Responsable',
    required: false,
    description: 'Persona a cargo del vehículo.',
    example: 'Carlos Muñoz',
    aliases: ['responsable', 'encargado', 'conductor', 'usuario'],
    width: 24,
  },
  {
    key: 'propietario',
    header: 'Propietario',
    required: false,
    description:
      'Dato privado opcional de flota, solo para admin y desarrollador. Máximo 180 caracteres.',
    example: 'Empresa propietaria',
    aliases: ['propietario', 'dueno', 'nombre propietario'],
    width: 28,
  },
  {
    key: 'motivoBaja',
    header: 'Motivo de baja',
    required: false,
    description:
      'Motivo opcional, máximo 500 caracteres. Solo se conserva con estado Dado de baja; la fecha de baja se asigna en el servidor al crear.',
    example: 'Retiro definitivo del vehículo',
    aliases: ['motivo baja', 'motivo de baja', 'razon baja', 'razon de baja'],
    width: 40,
  },
];

export const aliasesOf = (columns: readonly ImportColumnDefinition[]): Record<string, string[]> =>
  Object.fromEntries(columns.map((column) => [column.key, [...column.aliases]]));
