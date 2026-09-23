import bcrypt from 'bcrypt';
import { CatalogItem } from '../models/CatalogItem.js';
import { Permission } from '../models/Permission.js';
import { Role } from '../models/Role.js';
import { RolePermission } from '../models/RolePermission.js';
import { User } from '../models/User.js';
import { logger } from '../utils/logger.js';

const ROLES_SEED = [
  { nombre: 'desarrollador', descripcion: 'Acceso total al sistema (bypass de permisos)' },
  { nombre: 'admin', descripcion: 'Administrador general' },
  { nombre: 'jefe', descripcion: 'Jefe de taller / supervisor' },
  { nombre: 'mecanico', descripcion: 'Mecánico con acceso restringido a órdenes asignadas' },
  { nombre: 'vendedor', descripcion: 'Vendedor / asesor comercial' },
  { nombre: 'bodeguero', descripcion: 'Encargado de bodega y repuestos' },
  { nombre: 'finanzas', descripcion: 'Finanzas y contabilidad' },
] as const;

const MODULES = ['taller', 'comercial', 'finanzas', 'flota', 'admin'] as const;
const ACTIONS = ['read', 'create', 'update', 'delete', 'export', 'import'] as const;

type RoleName = (typeof ROLES_SEED)[number]['nombre'];
type Module = (typeof MODULES)[number];
type Action = (typeof ACTIONS)[number];

const ROLE_PERMISSIONS_MATRIX: Record<RoleName, Partial<Record<Module, readonly Action[]>>> = {
  desarrollador: {
    taller: ACTIONS,
    comercial: ACTIONS,
    finanzas: ACTIONS,
    flota: ACTIONS,
    admin: ACTIONS,
  },
  admin: {
    taller: ACTIONS,
    comercial: ACTIONS,
    finanzas: ACTIONS,
    flota: ACTIONS,
    admin: ACTIONS,
  },
  jefe: {
    taller: ['read', 'create', 'update', 'delete', 'export'],
    comercial: ['read', 'create', 'update', 'delete', 'export'],
    flota: ['read'],
    admin: ['read'],
  },
  mecanico: {
    taller: ['read', 'update'],
  },
  vendedor: {
    taller: ['read', 'create', 'update'],
    comercial: ['read', 'create', 'update', 'export'],
    flota: ['read'],
  },
  bodeguero: {
    taller: ['read', 'update'],
    comercial: ['read'],
    flota: ['read'],
  },
  finanzas: {
    comercial: ['read'],
    finanzas: ['read', 'create', 'update', 'delete', 'export'],
  },
};

const CATALOG_ITEMS_SEED = [
  { tipo: 'estandar' as const, codigo: null, nombre: 'Cambio de aceite', descripcion: 'Servicio estándar de cambio de aceite para motor', precio: 25000, stock: 0 },
  { tipo: 'estandar' as const, codigo: null, nombre: 'Cambio de filtro de aire', descripcion: 'Reemplazo e instalación de filtro de aire', precio: 12000, stock: 0 },
  { tipo: 'estandar' as const, codigo: null, nombre: 'Cambio de filtro de combustible', descripcion: 'Reemplazo e instalación de filtro de combustible', precio: 18000, stock: 0 },
  { tipo: 'estandar' as const, codigo: null, nombre: 'Alineación y balanceo', descripcion: 'Alineación computarizada y balanceo de 4 ruedas', precio: 35000, stock: 0 },
  { tipo: 'estandar' as const, codigo: null, nombre: 'Revisión y cambio de frenos', descripcion: 'Inspección de pastillas/discos y reemplazo', precio: 45000, stock: 0 },
  { tipo: 'estandar' as const, codigo: null, nombre: 'Diagnóstico computarizado', descripcion: 'Escaneo con scanner automotriz OBD2', precio: 20000, stock: 0 },
  { tipo: 'parte' as const, codigo: 'FILT-ACE-001', nombre: 'Filtro de aceite universal', descripcion: 'Filtro de aceite roscado para motores gasolina 4 cilindros', precio: 8500, stock: 50 },
  { tipo: 'parte' as const, codigo: 'PAST-FRN-001', nombre: 'Pastillas de freno delanteras (juego)', descripcion: 'Juego de pastillas de freno cerámicas para eje delantero', precio: 28000, stock: 20 },
  { tipo: 'parte' as const, codigo: 'BUJ-IRID-001', nombre: 'Bujía de Iridio NGK', descripcion: 'Bujía de alto rendimiento con electrodo de iridio', precio: 12500, stock: 40 },
];

export async function ensureDatabaseBootstrapped(): Promise<void> {
  try {
    // 1. Roles
    const roleCount = await Role.count();
    if (roleCount === 0) {
      logger.info('Inicializando roles por defecto...');
      for (const r of ROLES_SEED) {
        await Role.findOrCreate({ where: { nombre: r.nombre }, defaults: { ...r } });
      }
    }

    // 2. Permisos
    const permCount = await Permission.count();
    if (permCount === 0) {
      logger.info('Inicializando permisos por defecto...');
      for (const modulo of MODULES) {
        for (const accion of ACTIONS) {
          await Permission.findOrCreate({
            where: { modulo, accion },
            defaults: { modulo, accion },
          });
        }
      }
    }

    // 3. Matriz de permisos por rol
    const rolePermCount = await RolePermission.count();
    if (rolePermCount === 0) {
      logger.info('Inicializando matriz de permisos por rol...');
      const allRoles = await Role.findAll();
      const allPerms = await Permission.findAll();
      const roleMap = new Map(allRoles.map((r) => [r.nombre, r.id]));
      const permMap = new Map(allPerms.map((p) => [`${p.modulo}:${p.accion}`, p.id]));

      for (const [roleName, modulePermissions] of Object.entries(ROLE_PERMISSIONS_MATRIX)) {
        const roleId = roleMap.get(roleName as RoleName);
        if (!roleId) continue;

        for (const [modulo, acciones] of Object.entries(modulePermissions)) {
          if (!acciones) continue;
          for (const accion of acciones) {
            const permissionId = permMap.get(`${modulo}:${accion}`);
            if (!permissionId) continue;

            await RolePermission.findOrCreate({
              where: { roleId, permissionId },
              defaults: { roleId, permissionId },
            });
          }
        }
      }
    }

    // 4. Usuario Administrador Inicial
    const userCount = await User.count();
    if (userCount === 0) {
      logger.info('Inicializando usuario administrador principal...');
      const devRole = await Role.findOne({ where: { nombre: 'desarrollador' } });
      if (devRole) {
        const email = (process.env.SEED_ADMIN_EMAIL || 'admin@unithor.cl').trim().toLowerCase();
        const username = (process.env.SEED_ADMIN_USERNAME || 'admin').trim().toLowerCase();
        const rawPassword = process.env.SEED_ADMIN_PASSWORD || 'Admin123456!';
        const nombre = process.env.SEED_ADMIN_NAME || 'Administrador UNITHOR';

        const passwordHash = await bcrypt.hash(rawPassword, 10);
        await User.create({
          nombre,
          username,
          email,
          passwordHash,
          roleId: devRole.id,
          activo: true,
        });
        logger.info(`Usuario admin creado: ${username} (${email})`);
      }
    }

    // 5. Catálogo inicial
    const catalogCount = await CatalogItem.count();
    if (catalogCount === 0) {
      logger.info('Inicializando catálogo base...');
      for (const item of CATALOG_ITEMS_SEED) {
        await CatalogItem.create(item);
      }
    }

    logger.info('Base de datos inicializada y verificada exitosamente.');
  } catch (err) {
    logger.error({ err }, 'Error durante la inicialización de la base de datos');
  }
}
