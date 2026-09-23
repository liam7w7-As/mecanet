import { generateCommercialReportExcel } from '../services/commercial-report.service.js';
import {
  generateFinancialReportExcel,
  generateFinancialReportPdf,
} from '../services/financial-report.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

import type { CommercialReportFilters, FinancialReportFilters } from '@unithor/shared';
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
export const getFinancialReportExcelHandler = asyncHandler(
  async (_req: Request, res: Response): Promise<void> => {
    const filters = res.locals.validatedQuery as FinancialReportFilters;
    const reportBuffer = await generateFinancialReportExcel(filters);
    const filename =
      `Informe_Financiero_UNITHOR_${filters.fechaDesde}_${filters.fechaHasta}.xlsx`;

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', reportBuffer.length);
    res.status(200).end(reportBuffer);
  },
);

export const getFinancialReportPdfHandler = asyncHandler(
  async (_req: Request, res: Response): Promise<void> => {
    const filters = res.locals.validatedQuery as FinancialReportFilters;
    const pdfBytes = await generateFinancialReportPdf(filters);
    const filename =
      `Informe_Financiero_UNITHOR_${filters.fechaDesde}_${filters.fechaHasta}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBytes.length);
    res.status(200).end(Buffer.from(pdfBytes));
  },
);
