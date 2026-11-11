import {
  generateFinancialReportExcel,
  generateFinancialReportPdf,
} from '../services/financial-report.service.js';
import {
  generateAdministrationReportExcel,
  generateAdministrationReportPdf,
  generateCatalogReportExcel,
  generateCatalogReportPdf,
  generateCommercialReportPdf,
  generateDetailedCommercialReportExcel,
  generateFleetReportExcel,
  generateFleetReportPdf,
  generateInventoryReportExcel,
  generateInventoryReportPdf,
  generateWorkshopReportExcel,
  generateWorkshopReportPdf,
} from '../services/operational-report.service.js';
import { getSalesScope } from '../services/sales-access.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

import type {
  AdministrationReportFilters,
  CatalogReportFilters,
  CommercialReportFilters,
  FleetReportFilters,
  FinancialReportFilters,
  InventoryReportFilters,
  WorkshopReportFilters,
} from '@unithor/shared';
import type { Request, Response } from 'express';

/** Filtros de alcance que un vendedor aporta a cualquier reporte. */
const getSalesReportScope = async (req: Request) => {
  if (!req.user) return {};
  const scope = await getSalesScope(req.user.id);
  if (!scope) return {};
  return {
    salesUserId: scope.userId,
    grantedWorkOrderIds: scope.workOrderIds,
    grantedQuotationIds: scope.quotationIds,
    // El vendedor no puede pedir el informe de otro asesor: su alcance manda.
    asesorId: undefined,
  };
};

export const getCommercialReportExcelHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const filters = {
      ...(res.locals.validatedQuery as CommercialReportFilters),
      ...await getSalesReportScope(req),
    };
    const reportBuffer = await generateDetailedCommercialReportExcel(filters);

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

export const getCommercialReportPdfHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const filters = {
      ...(res.locals.validatedQuery as CommercialReportFilters),
      ...await getSalesReportScope(req),
    };
    const pdfBytes = await generateCommercialReportPdf(filters);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="Reporte_Comercial_UNITHOR_${filters.fechaDesde}_${filters.fechaHasta}.pdf"`,
    );
    res.setHeader('Content-Length', pdfBytes.length);
    res.status(200).end(Buffer.from(pdfBytes));
  },
);

export const getWorkshopReportExcelHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const filters = {
      ...(res.locals.validatedQuery as WorkshopReportFilters),
      ...await getSalesReportScope(req),
    };
    const reportBuffer = await generateWorkshopReportExcel(filters);

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="Reporte_Taller_UNITHOR_${filters.fechaDesde}_${filters.fechaHasta}.xlsx"`,
    );
    res.setHeader('Content-Length', reportBuffer.length);
    res.status(200).end(reportBuffer);
  },
);

export const getWorkshopReportPdfHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const filters = {
      ...(res.locals.validatedQuery as WorkshopReportFilters),
      ...await getSalesReportScope(req),
    };
    const pdfBytes = await generateWorkshopReportPdf(filters);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="Reporte_Taller_UNITHOR_${filters.fechaDesde}_${filters.fechaHasta}.pdf"`,
    );
    res.setHeader('Content-Length', pdfBytes.length);
    res.status(200).end(Buffer.from(pdfBytes));
  },
);

export const getInventoryReportExcelHandler = asyncHandler(
  async (_req: Request, res: Response): Promise<void> => {
    const filters = res.locals.validatedQuery as InventoryReportFilters;
    const reportBuffer = await generateInventoryReportExcel(filters);

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="Reporte_Almacenes_UNITHOR_${filters.fechaDesde}_${filters.fechaHasta}.xlsx"`,
    );
    res.setHeader('Content-Length', reportBuffer.length);
    res.status(200).end(reportBuffer);
  },
);

export const getInventoryReportPdfHandler = asyncHandler(
  async (_req: Request, res: Response): Promise<void> => {
    const filters = res.locals.validatedQuery as InventoryReportFilters;
    const pdfBytes = await generateInventoryReportPdf(filters);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="Reporte_Almacenes_UNITHOR_${filters.fechaDesde}_${filters.fechaHasta}.pdf"`,
    );
    res.setHeader('Content-Length', pdfBytes.length);
    res.status(200).end(Buffer.from(pdfBytes));
  },
);

export const getCatalogReportExcelHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const filters = {
      ...(res.locals.validatedQuery as CatalogReportFilters),
      ...await getSalesReportScope(req),
    };
    const reportBuffer = await generateCatalogReportExcel(filters);

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="Reporte_Catalogo_UNITHOR_${filters.fechaDesde}_${filters.fechaHasta}.xlsx"`,
    );
    res.setHeader('Content-Length', reportBuffer.length);
    res.status(200).end(reportBuffer);
  },
);

export const getCatalogReportPdfHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const filters = {
      ...(res.locals.validatedQuery as CatalogReportFilters),
      ...await getSalesReportScope(req),
    };
    const pdfBytes = await generateCatalogReportPdf(filters);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="Reporte_Catalogo_UNITHOR_${filters.fechaDesde}_${filters.fechaHasta}.pdf"`,
    );
    res.setHeader('Content-Length', pdfBytes.length);
    res.status(200).end(Buffer.from(pdfBytes));
  },
);

export const getFleetReportExcelHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const filters = {
      ...(res.locals.validatedQuery as FleetReportFilters),
      ...await getSalesReportScope(req),
    };
    const reportBuffer = await generateFleetReportExcel(filters);

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="Reporte_Clientes_Vehiculos_UNITHOR_${filters.fechaDesde}_${filters.fechaHasta}.xlsx"`,
    );
    res.setHeader('Content-Length', reportBuffer.length);
    res.status(200).end(reportBuffer);
  },
);

export const getFleetReportPdfHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const filters = {
      ...(res.locals.validatedQuery as FleetReportFilters),
      ...await getSalesReportScope(req),
    };
    const pdfBytes = await generateFleetReportPdf(filters);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="Reporte_Clientes_Vehiculos_UNITHOR_${filters.fechaDesde}_${filters.fechaHasta}.pdf"`,
    );
    res.setHeader('Content-Length', pdfBytes.length);
    res.status(200).end(Buffer.from(pdfBytes));
  },
);

export const getAdministrationReportExcelHandler = asyncHandler(
  async (_req: Request, res: Response): Promise<void> => {
    const filters = res.locals.validatedQuery as AdministrationReportFilters;
    const reportBuffer = await generateAdministrationReportExcel(filters);

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="Reporte_Cuentas_UNITHOR_${filters.fechaDesde}_${filters.fechaHasta}.xlsx"`,
    );
    res.setHeader('Content-Length', reportBuffer.length);
    res.status(200).end(reportBuffer);
  },
);

export const getAdministrationReportPdfHandler = asyncHandler(
  async (_req: Request, res: Response): Promise<void> => {
    const filters = res.locals.validatedQuery as AdministrationReportFilters;
    const pdfBytes = await generateAdministrationReportPdf(filters);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="Reporte_Cuentas_UNITHOR_${filters.fechaDesde}_${filters.fechaHasta}.pdf"`,
    );
    res.setHeader('Content-Length', pdfBytes.length);
    res.status(200).end(Buffer.from(pdfBytes));
  },
);

export const getFinancialReportExcelHandler = asyncHandler(
  async (_req: Request, res: Response): Promise<void> => {
    const filters = res.locals.validatedQuery as FinancialReportFilters;
    const reportBuffer = await generateFinancialReportExcel(filters);
    const filename = `Informe_Financiero_UNITHOR_${filters.fechaDesde}_${filters.fechaHasta}.xlsx`;

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
    const filename = `Informe_Financiero_UNITHOR_${filters.fechaDesde}_${filters.fechaHasta}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBytes.length);
    res.status(200).end(Buffer.from(pdfBytes));
  },
);
