import {
  catalogItemQuerySchema,
  clientQuerySchema,
  fleetVehicleQuerySchema,
  isValidChilePatente,
  normalizeChilePatente,
  stockMovementQuerySchema,
  userQuerySchema,
  vehicleQuerySchema,
  warehouseQuerySchema,
  warehouseRequestQuerySchema,
} from '@unithor/shared';

import { Client } from '../../models/Client.js';
import { ApiError } from '../../utils/ApiError.js';
import { listCatalogItems } from '../catalog.service.js';
import { listClients } from '../client.service.js';
import { listFleetVehicles } from '../fleet-vehicle.service.js';
import {
  CATALOG_IMPORT_COLUMNS,
  FLEET_IMPORT_COLUMNS,
  VEHICLE_IMPORT_COLUMNS,
} from '../import/import-columns.js';
import { getRolePermissions, listAllPermissions, listAllRoles } from '../permission.service.js';
import { listUsers } from '../user.service.js';
import { listVehicles } from '../vehicle.service.js';
import {
  getWarehouseBalances,
  listMovements,
  listWarehouses,
  listWorkOrderRequests,
} from '../warehouse.service.js';
import { collectExportPages, exportFilters, exportQuery } from './export-utils.js';

import type { ExportBuilder, ExportColumn, ExportDataset, ExportValue } from './export-types.js';
import type { ImportColumnDefinition } from '../import/import-columns.js';

type ExportRow = Record<string, ExportValue>;

const importColumns = (
  definitions: readonly ImportColumnDefinition[],
  compact: readonly string[],
): ExportColumn[] =>
  definitions.map(({ key, header, width }) => ({
    key,
    header,
    width,
    pdf: compact.includes(key),
    kind: ['id', 'ano', 'kilometraje', 'stock', 'stockMinimo', 'horasHombreEstandar'].includes(key)
      ? 'number'
      : key === 'precio'
        ? 'money'
        : 'text',
  }));

const dataset = (
  title: string,
  columns: ExportColumn[],
  rows: ExportRow[],
  parsedQuery: object,
  notes?: string[],
): ExportDataset => ({
  title,
  tables: [{ name: 'Datos', columns, rows }],
  filters: exportFilters(parsedQuery),
  ...(notes ? { notes } : {}),
});

// These lists are not paginated by their existing services. Apply the same hard
// limit after the screen's filters, without ever returning a truncated report.
const collectUnpaged = <T>(items: T[]): Promise<T[]> =>
  collectExportPages(async () => ({
    items,
    total: items.length,
    totalPages: 1,
  }));

const balanceQuerySchema = stockMovementQuerySchema.pick({ warehouseId: true }).extend({
  warehouseId: stockMovementQuerySchema.shape.warehouseId.unwrap(),
  search: clientQuerySchema.shape.search,
});
const roleFilterSchema = userQuerySchema.pick({ roleId: true });

/** Read-only adapters; the export route authenticates and checks both policy rights first. */
export const buildDirectoryExport: ExportBuilder = async (target, query, actor) => {
  switch (target) {
    case 'clients': {
      const parsed = clientQuerySchema.parse(exportQuery(query));
      const items = await collectExportPages((page) => listClients({ ...parsed, page }));
      return dataset(
        'Clientes',
        [
          { key: 'id', header: 'ID', kind: 'number' },
          { key: 'tipo', header: 'Tipo' },
          { key: 'rut', header: 'RUT' },
          { key: 'nombre', header: 'Nombre', width: 32 },
          { key: 'email', header: 'Email', width: 28 },
          { key: 'telefono', header: 'Teléfono', width: 20 },
          { key: 'direccion', header: 'Dirección', pdf: false },
          { key: 'region', header: 'Región', pdf: false },
          { key: 'comuna', header: 'Comuna', pdf: false },
          { key: 'notas', header: 'Notas', pdf: false },
        ],
        items.map((item) => ({
          id: item.id,
          tipo: item.tipo,
          rut: item.rut,
          nombre: item.nombre,
          email: item.email,
          telefono: item.telefono,
          direccion: item.direccion,
          region: item.region,
          comuna: item.comuna,
          notas: item.notas,
        })),
        parsed,
      );
    }

    case 'vehicles': {
      const parsed = vehicleQuerySchema.parse(exportQuery(query));
      const items = await collectExportPages((page) => listVehicles({ ...parsed, page }));
      // The list's public client relation lacks email. Fetch only that public
      // field for the related active clients, keeping the default paranoid scope.
      const clientIds = [
        ...new Set(items.flatMap((item) => (item.client ? [item.client.id] : []))),
      ];
      const clients =
        clientIds.length === 0
          ? []
          : await Client.findAll({
              where: { id: clientIds },
              attributes: ['id', 'email'],
            });
      const emails = new Map(clients.map((client) => [client.id, client.email]));
      return dataset(
        'Vehículos',
        importColumns(VEHICLE_IMPORT_COLUMNS, [
          'id',
          'patente',
          'marca',
          'modelo',
          'ano',
          'kilometraje',
          'propietario',
        ]),
        items.map((item) => ({
          id: item.id,
          patente: item.patente,
          marca: item.marca,
          modelo: item.modelo,
          ano: item.ano,
          color: item.color,
          vinChasis: item.vinChasis,
          motor: item.motor,
          kilometraje: item.kilometraje,
          combustible: item.combustible,
          transmision: item.transmision,
          // No foreign-plate flag is persisted. Preserve noncanonical stored plates
          // verbatim, including foreign plates that resemble a hyphenated Chilean plate.
          esExtranjera:
            item.patente !== normalizeChilePatente(item.patente) ||
            !isValidChilePatente(item.patente)
              ? 'Sí'
              : null,
          propietario: item.client?.nombre ?? null,
          rutPropietario: item.client?.rut ?? null,
          telefonoPropietario: item.client?.telefono ?? null,
          emailPropietario: item.client ? (emails.get(item.client.id) ?? null) : null,
        })),
        parsed,
        [
          'Patente extranjera no se almacena como indicador: se exporta Sí si la patente guardada no es chilena o difiere de su formato canónico, para conservarla exactamente al reimportar. Solo las patentes chilenas ya canónicas dejan la celda vacía.',
        ],
      );
    }

    case 'fleet-vehicles': {
      const parsed = fleetVehicleQuerySchema.parse(exportQuery(query));
      const includeOwner =
        ['admin', 'desarrollador'].includes(actor.role) &&
        (query.includeOwner === 'true' || query.includeOwner === true);
      const items = await collectExportPages((page) =>
        listFleetVehicles({ ...parsed, page }, includeOwner ? actor.role : undefined),
      );
      const columns = importColumns(
        FLEET_IMPORT_COLUMNS.filter((column) => column.key !== 'propietario' || includeOwner),
        [
          'id',
          'patente',
          'codigoInterno',
          'marca',
          'modelo',
          'estadoOperativo',
          'responsable',
          'propietario',
        ],
      );
      columns.push(
        { key: 'fechaBaja', header: 'Fecha de baja', kind: 'datetime', pdf: false },
        { key: 'documentos', header: 'Documentos', kind: 'number', pdf: false },
        { key: 'documentosVencidos', header: 'Documentos vencidos', kind: 'number', pdf: false },
        { key: 'documentosPorVencer', header: 'Documentos por vencer', kind: 'number', pdf: false },
        { key: 'proximoVencimiento', header: 'Próximo vencimiento', kind: 'date' },
      );
      return dataset(
        'Vehículos de flota',
        columns,
        items.map((item) => ({
          id: item.id,
          patente: item.patente,
          codigoInterno: item.codigoInterno,
          marca: item.marca,
          modelo: item.modelo,
          ano: item.ano,
          color: item.color,
          vinChasis: item.vinChasis,
          motor: item.motor,
          kilometraje: item.kilometraje,
          combustible: item.combustible,
          transmision: item.transmision,
          estadoOperativo: item.estadoOperativo,
          sucursal: item.sucursal,
          responsable: item.responsable,
          ...(includeOwner ? { propietario: item.propietario ?? null } : {}),
          motivoBaja: item.motivoBaja,
          fechaBaja: item.fechaBaja,
          documentos: item.documentSummary.total,
          documentosVencidos: item.documentSummary.expired,
          documentosPorVencer: item.documentSummary.expiringSoon,
          proximoVencimiento: item.documentSummary.nextExpiry?.fechaVencimiento ?? null,
        })),
        parsed,
      );
    }

    case 'catalog': {
      const parsed = catalogItemQuerySchema.parse(exportQuery(query));
      const items = await collectExportPages((page) => listCatalogItems({ ...parsed, page }));
      const columns = importColumns(CATALOG_IMPORT_COLUMNS, [
        'id',
        'tipo',
        'codigo',
        'nombre',
        'precio',
      ]);
      columns.push({
        key: 'stockGlobal',
        header: 'Stock global (consulta)',
        kind: 'number',
        width: 24,
      });
      return dataset(
        'Catálogo',
        columns,
        items.map((item) => ({
          id: item.id,
          tipo: item.tipo,
          codigo: item.codigo,
          nombre: item.nombre,
          descripcion: item.descripcion,
          unidadMedida: item.unidadMedida,
          precio: item.precio,
          stock: null,
          stockMinimo: item.stockMinimo,
          horasHombreEstandar: item.horasHombreEstandar,
          stockGlobal: item.stock,
        })),
        parsed,
        [
          'Exportación consolidada: Stock se deja vacío para reimportar metadatos sin modificar saldos de almacenes. Stock global (consulta) muestra la suma global y no se importa.',
          'Rellena Stock únicamente si deseas establecer intencionalmente el saldo final del almacén seleccionado al importar; nunca copies el stock global a un único almacén.',
        ],
      );
    }

    case 'users': {
      const parsed = userQuerySchema.parse(exportQuery(query));
      const items = await collectExportPages(async (page) => {
        const result = await listUsers({ ...parsed, page });
        return { items: result.data, total: result.meta.total, totalPages: result.meta.totalPages };
      });
      return dataset(
        'Usuarios',
        [
          { key: 'id', header: 'ID', kind: 'number' },
          { key: 'nombre', header: 'Nombre', width: 28 },
          { key: 'username', header: 'Usuario' },
          { key: 'email', header: 'Email', width: 28 },
          { key: 'roleId', header: 'ID rol', kind: 'number', pdf: false },
          { key: 'rol', header: 'Rol' },
          { key: 'activo', header: 'Activo', kind: 'boolean' },
        ],
        items.map((item) => ({
          id: item.id,
          nombre: item.nombre,
          username: item.username,
          email: item.email,
          roleId: item.roleId,
          rol: item.role.nombre,
          activo: item.activo,
        })),
        parsed,
      );
    }

    case 'role-permissions': {
      const parsed = roleFilterSchema.parse(query);
      const allRoles = await listAllRoles();
      const roles = allRoles.filter(
        (role) => parsed.roleId === undefined || role.id === parsed.roleId,
      );
      if (parsed.roleId !== undefined && roles.length === 0)
        throw ApiError.notFound('Rol no encontrado');
      const permissions = await listAllPermissions();
      const rows: ExportRow[] = [];
      for (const role of roles) {
        const assigned = new Set(
          (await getRolePermissions(role.id)).map((permission) => permission.id),
        );
        const protectedRole = ['admin', 'desarrollador'].includes(role.nombre);
        for (const permission of permissions) {
          rows.push({
            roleId: role.id,
            rol: role.nombre,
            descripcion: role.descripcion,
            permissionId: permission.id,
            modulo: permission.modulo,
            accion: permission.accion,
            permitido: protectedRole || assigned.has(permission.id),
          });
        }
      }
      return dataset(
        'Roles y permisos',
        [
          { key: 'roleId', header: 'ID rol', kind: 'number' },
          { key: 'rol', header: 'Rol' },
          { key: 'descripcion', header: 'Descripción del rol', width: 35, pdf: false },
          { key: 'permissionId', header: 'ID permiso', kind: 'number', pdf: false },
          { key: 'modulo', header: 'Módulo' },
          { key: 'accion', header: 'Acción' },
          { key: 'permitido', header: 'Permitido', kind: 'boolean' },
        ],
        await collectUnpaged(rows),
        parsed,
        [
          'Permisos efectivos guardados: admin y desarrollador tienen acceso irrestricto. Los cambios sin guardar en la pantalla no se exportan.',
        ],
      );
    }

    case 'warehouses': {
      const parsed = warehouseQuerySchema.parse(exportQuery(query));
      const items = await collectExportPages((page) => listWarehouses({ ...parsed, page }));
      return dataset(
        'Almacenes',
        [
          { key: 'id', header: 'ID', kind: 'number' },
          { key: 'codigo', header: 'Código' },
          { key: 'nombre', header: 'Nombre', width: 30 },
          { key: 'direccion', header: 'Dirección', width: 35 },
          { key: 'activo', header: 'Activo', kind: 'boolean' },
          { key: 'totalItems', header: 'Ítems con stock', kind: 'number' },
          { key: 'totalUnidades', header: 'Unidades', kind: 'number' },
        ],
        items.map((item) => ({
          id: item.id,
          codigo: item.codigo,
          nombre: item.nombre,
          direccion: item.direccion,
          activo: item.activo,
          totalItems: item.totalItems,
          totalUnidades: item.totalUnidades,
        })),
        parsed,
      );
    }

    case 'stock-balances': {
      const parsed = balanceQuerySchema.parse(query);
      const balances = await getWarehouseBalances(parsed.warehouseId);
      // Mirror WarehousesPage's client-side search before its 20-row pagination.
      const term = parsed.search?.toLowerCase() ?? '';
      const items = await collectUnpaged(
        balances.filter(
          (item) =>
            !term ||
            item.nombre.toLowerCase().includes(term) ||
            (item.codigo ?? '').toLowerCase().includes(term),
        ),
      );
      return dataset(
        'Saldos de almacén',
        [
          { key: 'warehouseId', header: 'ID almacén', kind: 'number' },
          { key: 'catalogItemId', header: 'ID ítem', kind: 'number' },
          { key: 'codigo', header: 'Código' },
          { key: 'nombre', header: 'Nombre', width: 34 },
          { key: 'cantidad', header: 'Stock', kind: 'number' },
          { key: 'precio', header: 'Precio', kind: 'money', pdf: false },
          { key: 'stockMinimo', header: 'Stock mínimo', kind: 'number' },
          { key: 'bajoMinimo', header: 'Bajo mínimo', kind: 'boolean' },
        ],
        items.map((item) => ({
          warehouseId: item.warehouseId,
          catalogItemId: item.catalogItemId,
          codigo: item.codigo,
          nombre: item.nombre,
          cantidad: item.cantidad,
          precio: item.precio,
          stockMinimo: item.stockMinimo,
          bajoMinimo: item.bajoMinimo,
        })),
        parsed,
      );
    }

    case 'stock-movements': {
      const parsed = stockMovementQuerySchema.parse(exportQuery(query));
      const items = await collectExportPages((page) => listMovements({ ...parsed, page }));
      return dataset(
        'Movimientos de stock',
        [
          { key: 'id', header: 'ID', kind: 'number' },
          { key: 'fecha', header: 'Fecha', kind: 'datetime' },
          { key: 'warehouseId', header: 'ID almacén', kind: 'number', pdf: false },
          { key: 'warehouseCodigo', header: 'Código almacén', pdf: false },
          { key: 'warehouseNombre', header: 'Almacén' },
          { key: 'catalogItemId', header: 'ID ítem', kind: 'number', pdf: false },
          { key: 'codigo', header: 'Código' },
          { key: 'nombre', header: 'Nombre', width: 30 },
          { key: 'tipo', header: 'Tipo' },
          { key: 'cantidad', header: 'Cantidad', kind: 'number' },
          { key: 'saldoResultante', header: 'Saldo', kind: 'number' },
          { key: 'motivo', header: 'Motivo', width: 35 },
          { key: 'referencia', header: 'Referencia', pdf: false },
          { key: 'createdBy', header: 'ID usuario', kind: 'number', pdf: false },
        ],
        items.map((item) => ({
          id: item.id,
          fecha: item.fecha,
          warehouseId: item.warehouseId,
          warehouseCodigo: item.warehouseCodigo,
          warehouseNombre: item.warehouseNombre,
          catalogItemId: item.catalogItemId,
          codigo: item.codigo,
          nombre: item.nombre,
          tipo: item.tipo,
          cantidad: item.cantidad,
          saldoResultante: item.saldoResultante,
          motivo: item.motivo,
          referencia: item.referencia,
          createdBy: item.createdBy,
        })),
        parsed,
      );
    }

    case 'warehouse-requests': {
      const parsed = warehouseRequestQuerySchema.parse(exportQuery(query));
      const items = await collectExportPages((page) =>
        listWorkOrderRequests({ ...parsed, page }, actor.id),
      );
      return dataset(
        'Solicitudes de almacén',
        [
          { key: 'id', header: 'ID', kind: 'number' },
          { key: 'orden', header: 'OT' },
          { key: 'cliente', header: 'Cliente', width: 28 },
          { key: 'patente', header: 'Patente' },
          { key: 'codigo', header: 'Código' },
          { key: 'repuesto', header: 'Repuesto', width: 30 },
          { key: 'cantidad', header: 'Cantidad', kind: 'number' },
          { key: 'estado', header: 'Estado' },
          { key: 'motivo', header: 'Motivo', pdf: false },
          { key: 'precioAprobado', header: 'Precio aprobado', kind: 'money', pdf: false },
          { key: 'solicitante', header: 'Solicitante', pdf: false },
          { key: 'mecanico', header: 'Mecánico', pdf: false },
          { key: 'revisor', header: 'Revisor', pdf: false },
          { key: 'createdAt', header: 'Fecha solicitud', kind: 'datetime', pdf: false },
          { key: 'reviewedAt', header: 'Fecha revisión', kind: 'datetime', pdf: false },
          { key: 'almacenEntrega', header: 'Almacén de entrega', pdf: false },
          { key: 'entregadoPor', header: 'Entregado por', pdf: false },
          { key: 'deliveredAt', header: 'Fecha entrega', kind: 'datetime', pdf: false },
          { key: 'deliveryNote', header: 'Nota de entrega', pdf: false },
        ],
        items.map((item) => ({
          id: item.id,
          orden: item.workOrder.codigo,
          cliente: item.workOrder.client?.nombre ?? null,
          patente: item.workOrder.vehicle?.patente ?? null,
          codigo: item.catalogItem.codigo,
          repuesto: item.catalogItem.nombre,
          cantidad: item.cantidad,
          estado: item.estado,
          motivo: item.motivo,
          precioAprobado: item.precioAprobado,
          solicitante: item.requester?.nombre ?? null,
          mecanico: item.workOrder.mechanic?.nombre ?? null,
          revisor: item.reviewer?.nombre ?? null,
          createdAt: item.createdAt,
          reviewedAt: item.reviewedAt,
          almacenEntrega: item.deliveredWarehouse?.nombre ?? null,
          entregadoPor: item.deliverer?.nombre ?? null,
          deliveredAt: item.deliveredAt,
          deliveryNote: item.deliveryNote,
        })),
        parsed,
      );
    }

    default:
      return null;
  }
};
