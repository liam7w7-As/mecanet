import {
  administrationReportQuerySchema,
  catalogReportQuerySchema,
  commercialReportQuerySchema,
  fleetReportQuerySchema,
  financialReportQuerySchema,
  inventoryReportQuerySchema,
  workshopReportQuerySchema,
} from '@unithor/shared';
import { Router } from 'express';

import {
  getAdministrationReportPreviewHandler,
  getCatalogReportPreviewHandler,
  getFleetReportPreviewHandler,
  getInventoryReportPreviewHandler,
  getAdministrationReportExcelHandler,
  getAdministrationReportPdfHandler,
  getCatalogReportExcelHandler,
  getCatalogReportPdfHandler,
  getCommercialReportExcelHandler,
  getCommercialReportPdfHandler,
  getFleetReportExcelHandler,
  getFleetReportPdfHandler,
  getFinancialReportExcelHandler,
  getFinancialReportPdfHandler,
  getInventoryReportExcelHandler,
  getInventoryReportPdfHandler,
  getWorkshopReportExcelHandler,
  getWorkshopReportPdfHandler,
} from '../controllers/report.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { authorizeAny } from '../middlewares/authorize-any.js';
import { validate } from '../middlewares/validate.js';
import { hasPermission } from '../services/permission.service.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const reportRouter = Router();

// Match canReadReport + an export grant, preserving legacy cross-area finance
// exports while preventing export-only access after read permission is revoked.
const authorizeReportDownload = (areas: string[]) => asyncHandler(async (req, _res, next) => {
  if (!req.user) throw ApiError.unauthorized();
  const userId = req.user.id;
  const allowed = await Promise.all(areas.map(async (area) => {
    return Promise.all([
      hasPermission(userId, area, 'read'),
      hasPermission(userId, area, 'export'),
    ]);
  }));
  if (!allowed.some(([read]) => read) || !allowed.some(([, exportAllowed]) => exportAllowed)) {
    throw ApiError.forbidden('Necesitas permisos de lectura y exportación para este reporte.');
  }
  next();
});

const fleetReportRoles = asyncHandler(async (req, _res, next) => {
  if (req.user?.role === 'mecanico') throw ApiError.forbidden('No tienes acceso a este reporte.');
  next();
});

reportRouter.use(authenticate);

reportRouter.get(
  '/inventory/preview',
  authorizeAny([{ modulo: 'almacen', accion: 'read' }, { modulo: 'finanzas', accion: 'read' }]),
  validate({ query: inventoryReportQuerySchema }),
  getInventoryReportPreviewHandler,
);
reportRouter.get(
  '/catalog/preview',
  authorizeAny([
    { modulo: 'almacen', accion: 'read' },
    { modulo: 'taller', accion: 'read' },
    { modulo: 'comercial', accion: 'read' },
    { modulo: 'finanzas', accion: 'read' },
  ]),
  validate({ query: catalogReportQuerySchema }),
  getCatalogReportPreviewHandler,
);
reportRouter.get(
  '/fleet/preview',
  fleetReportRoles,
  authorizeAny([{ modulo: 'comercial', accion: 'read' }, { modulo: 'taller', accion: 'read' }, { modulo: 'finanzas', accion: 'read' }]),
  validate({ query: fleetReportQuerySchema }),
  getFleetReportPreviewHandler,
);
reportRouter.get(
  '/administration/preview',
  authorizeAny([{ modulo: 'admin', accion: 'read' }]),
  validate({ query: administrationReportQuerySchema }),
  getAdministrationReportPreviewHandler,
);

reportRouter.get(
  '/commercial/excel',
  authorizeReportDownload(['comercial', 'finanzas']),
  validate({ query: commercialReportQuerySchema }),
  getCommercialReportExcelHandler,
);
reportRouter.get(
  '/commercial/pdf',
  authorizeReportDownload(['comercial', 'finanzas']),
  validate({ query: commercialReportQuerySchema }),
  getCommercialReportPdfHandler,
);
reportRouter.get(
  '/workshop/excel',
  authorizeReportDownload(['taller', 'finanzas']),
  validate({ query: workshopReportQuerySchema }),
  getWorkshopReportExcelHandler,
);
reportRouter.get(
  '/workshop/pdf',
  authorizeReportDownload(['taller', 'finanzas']),
  validate({ query: workshopReportQuerySchema }),
  getWorkshopReportPdfHandler,
);
reportRouter.get(
  '/inventory/excel',
  authorizeReportDownload(['almacen', 'finanzas']),
  validate({ query: inventoryReportQuerySchema }),
  getInventoryReportExcelHandler,
);
reportRouter.get(
  '/inventory/pdf',
  authorizeReportDownload(['almacen', 'finanzas']),
  validate({ query: inventoryReportQuerySchema }),
  getInventoryReportPdfHandler,
);
reportRouter.get(
  '/catalog/excel',
  authorizeReportDownload(['almacen', 'taller', 'comercial', 'finanzas']),
  validate({ query: catalogReportQuerySchema }),
  getCatalogReportExcelHandler,
);
reportRouter.get(
  '/catalog/pdf',
  authorizeReportDownload(['almacen', 'taller', 'comercial', 'finanzas']),
  validate({ query: catalogReportQuerySchema }),
  getCatalogReportPdfHandler,
);
reportRouter.get(
  '/fleet/excel',
  fleetReportRoles,
  authorizeReportDownload(['comercial', 'taller', 'finanzas']),
  validate({ query: fleetReportQuerySchema }),
  getFleetReportExcelHandler,
);
reportRouter.get(
  '/fleet/pdf',
  fleetReportRoles,
  authorizeReportDownload(['comercial', 'taller', 'finanzas']),
  validate({ query: fleetReportQuerySchema }),
  getFleetReportPdfHandler,
);
reportRouter.get(
  '/administration/excel',
  authorizeReportDownload(['admin']),
  validate({ query: administrationReportQuerySchema }),
  getAdministrationReportExcelHandler,
);
reportRouter.get(
  '/administration/pdf',
  authorizeReportDownload(['admin']),
  validate({ query: administrationReportQuerySchema }),
  getAdministrationReportPdfHandler,
);
reportRouter.get(
  '/finance/excel',
  authorizeReportDownload(['finanzas']),
  validate({ query: financialReportQuerySchema }),
  getFinancialReportExcelHandler,
);

reportRouter.get(
  '/finance/pdf',
  authorizeReportDownload(['finanzas']),
  validate({ query: financialReportQuerySchema }),
  getFinancialReportPdfHandler,
);
