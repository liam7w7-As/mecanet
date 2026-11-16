import { isWorkshopCostReportRole, workshopCostReportQuerySchema } from '@unithor/shared';
import { Router } from 'express';

import { authenticate } from '../middlewares/authenticate.js';
import { validate } from '../middlewares/validate.js';
import { hasPermission } from '../services/permission.service.js';
import {
  generateWorkshopCostReport,
  getWorkshopCostReport,
} from '../services/workshop-cost-report.service.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

import type { WorkshopCostReportFilters } from '@unithor/shared';

export const workshopCostReportRouter = Router();

const authorizeCosts = (download: boolean) =>
  asyncHandler(async (req, _res, next) => {
    if (!req.user) throw ApiError.unauthorized();
    if (!isWorkshopCostReportRole(req.user.role))
      throw ApiError.forbidden('No tienes acceso a los costos internos de mano de obra.');
    const userId = req.user.id;
    const grants = await Promise.all(
      ['taller', 'finanzas'].map(async (module) => {
        const read = await hasPermission(userId, module, 'read');
        return read && (!download || (await hasPermission(userId, module, 'export')));
      }),
    );
    if (!grants.some(Boolean))
      throw ApiError.forbidden(
        download
          ? 'Necesitas lectura y exportación en el mismo módulo de taller o finanzas.'
          : 'Necesitas lectura de taller o finanzas para consultar los costos.',
      );
    next();
  });

workshopCostReportRouter.use(authenticate);
workshopCostReportRouter.get(
  '/preview',
  authorizeCosts(false),
  validate({ query: workshopCostReportQuerySchema }),
  asyncHandler(async (_req, res) => {
    const report = await getWorkshopCostReport(
      res.locals.validatedQuery as WorkshopCostReportFilters,
    );
    res.setHeader('Cache-Control', 'private, no-store');
    res.json(report);
  }),
);

for (const format of ['pdf', 'excel'] as const) {
  workshopCostReportRouter.get(
    `/${format}`,
    authorizeCosts(true),
    validate({ query: workshopCostReportQuerySchema }),
    asyncHandler(async (_req, res) => {
      const bytes = await generateWorkshopCostReport(
        res.locals.validatedQuery as WorkshopCostReportFilters,
        format,
      );
      const pdf = format === 'pdf';
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader(
        'Content-Type',
        pdf
          ? 'application/pdf'
          : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      res.setHeader(
        'Content-Disposition',
        `${pdf ? 'inline' : 'attachment'}; filename="UNITHOR-costos-mano-obra-${Date.now()}.${pdf ? 'pdf' : 'xlsx'}"`,
      );
      res.setHeader('Content-Length', String(bytes.length));
      res.status(200).end(Buffer.from(bytes));
    }),
  );
}
