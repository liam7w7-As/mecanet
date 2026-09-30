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

export const reportRouter = Router();

reportRouter.use(authenticate);

reportRouter.get(
  '/commercial/excel',
  authorizeAny([{ modulo: 'comercial', accion: 'export' }, { modulo: 'finanzas', accion: 'export' }]),
  validate({ query: commercialReportQuerySchema }),
  getCommercialReportExcelHandler,
);
reportRouter.get(
  '/commercial/pdf',
  authorizeAny([{ modulo: 'comercial', accion: 'export' }, { modulo: 'finanzas', accion: 'export' }]),
  validate({ query: commercialReportQuerySchema }),
  getCommercialReportPdfHandler,
);
reportRouter.get(
  '/workshop/excel',
  authorizeAny([{ modulo: 'taller', accion: 'export' }, { modulo: 'finanzas', accion: 'export' }]),
  validate({ query: workshopReportQuerySchema }),
  getWorkshopReportExcelHandler,
);
reportRouter.get(
  '/workshop/pdf',
  authorizeAny([{ modulo: 'taller', accion: 'export' }, { modulo: 'finanzas', accion: 'export' }]),
  validate({ query: workshopReportQuerySchema }),
  getWorkshopReportPdfHandler,
);
reportRouter.get(
  '/inventory/excel',
  authorizeAny([{ modulo: 'almacen', accion: 'export' }, { modulo: 'finanzas', accion: 'export' }]),
  validate({ query: inventoryReportQuerySchema }),
  getInventoryReportExcelHandler,
);
reportRouter.get(
  '/inventory/pdf',
  authorizeAny([{ modulo: 'almacen', accion: 'export' }, { modulo: 'finanzas', accion: 'export' }]),
  validate({ query: inventoryReportQuerySchema }),
  getInventoryReportPdfHandler,
);
reportRouter.get(
  '/catalog/excel',
  authorizeAny([
    { modulo: 'almacen', accion: 'export' },
    { modulo: 'taller', accion: 'export' },
    { modulo: 'comercial', accion: 'export' },
    { modulo: 'finanzas', accion: 'export' },
  ]),
  validate({ query: catalogReportQuerySchema }),
  getCatalogReportExcelHandler,
);
reportRouter.get(
  '/catalog/pdf',
  authorizeAny([
    { modulo: 'almacen', accion: 'export' },
    { modulo: 'taller', accion: 'export' },
    { modulo: 'comercial', accion: 'export' },
    { modulo: 'finanzas', accion: 'export' },
  ]),
  validate({ query: catalogReportQuerySchema }),
  getCatalogReportPdfHandler,
);
reportRouter.get(
  '/fleet/excel',
  authorizeAny([
    { modulo: 'comercial', accion: 'export' },
    { modulo: 'taller', accion: 'export' },
    { modulo: 'finanzas', accion: 'export' },
  ]),
  validate({ query: fleetReportQuerySchema }),
  getFleetReportExcelHandler,
);
reportRouter.get(
  '/fleet/pdf',
  authorizeAny([
    { modulo: 'comercial', accion: 'export' },
    { modulo: 'taller', accion: 'export' },
    { modulo: 'finanzas', accion: 'export' },
  ]),
  validate({ query: fleetReportQuerySchema }),
  getFleetReportPdfHandler,
);
reportRouter.get(
  '/administration/excel',
  authorizeAny([{ modulo: 'admin', accion: 'export' }]),
  validate({ query: administrationReportQuerySchema }),
  getAdministrationReportExcelHandler,
);
reportRouter.get(
  '/administration/pdf',
  authorizeAny([{ modulo: 'admin', accion: 'export' }]),
  validate({ query: administrationReportQuerySchema }),
  getAdministrationReportPdfHandler,
);
reportRouter.get(
  '/finance/excel',
  authorizeAny([{ modulo: 'finanzas', accion: 'export' }]),
  validate({ query: financialReportQuerySchema }),
  getFinancialReportExcelHandler,
);

reportRouter.get(
  '/finance/pdf',
  authorizeAny([{ modulo: 'finanzas', accion: 'export' }]),
  validate({ query: financialReportQuerySchema }),
  getFinancialReportPdfHandler,
);
