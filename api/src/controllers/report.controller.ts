import { generateCommercialReportExcel } from '../services/commercial-report.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

import type { CommercialReportFilters } from '@unithor/shared';
import type { Request, Response } from 'express';

export const getCommercialReportExcelHandler = asyncHandler(
  async (_req: Request, res: Response): Promise<void> => {
    const filters = res.locals.validatedQuery as CommercialReportFilters;
    const reportBuffer = await generateCommercialReportExcel(filters);

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="Reporte_Comercial_UNITHOR_${Date.now()}.xlsx"`,
    );
    res.setHeader('Content-Length', reportBuffer.length);
    res.status(200).end(reportBuffer);
  },
);
