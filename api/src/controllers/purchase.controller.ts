import {
  generatePurchaseReportExcel,
  generatePurchaseReportPdf,
} from '../services/purchase-report.service.js';
import * as purchaseService from '../services/purchase.service.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

import type {
  CreatePurchaseInput,
  PurchaseQueryInput,
  PurchaseReportQueryInput,
  RegisterPurchasePaymentInput,
  SupplierQueryInput,
  UpdateSupplierInput,
  VoidPurchaseInput,
} from '@unithor/shared';
import type { Request, Response } from 'express';

const getParamId = (req: Request): number => Number(req.params.id);

const getCurrentUserId = (req: Request): number => {
  if (!req.user) {
    throw ApiError.internal('Error de programación: controlador requiere authenticate previo');
  }

  return req.user.id;
};

export const getSuppliersHandler = asyncHandler(
  async (_req: Request, res: Response): Promise<void> => {
    const query = res.locals.validatedQuery as SupplierQueryInput;
    res.status(200).json(await purchaseService.listSuppliers(query));
  },
);

export const getSupplierHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    res.status(200).json({ supplier: await purchaseService.getSupplierById(getParamId(req)) });
  },
);

export const updateSupplierHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const supplier = await purchaseService.updateSupplier(
      getParamId(req),
      req.body as UpdateSupplierInput,
    );
    res.status(200).json({ supplier });
  },
);

export const getPurchasesHandler = asyncHandler(
  async (_req: Request, res: Response): Promise<void> => {
    const query = res.locals.validatedQuery as PurchaseQueryInput;
    res.status(200).json(await purchaseService.listPurchases(query));
  },
);

export const getPurchaseHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    res.status(200).json({ purchase: await purchaseService.getPurchaseById(getParamId(req)) });
  },
);

export const createPurchaseHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const purchase = await purchaseService.createPurchase(
      req.body as CreatePurchaseInput,
      getCurrentUserId(req),
      req.file,
    );
    res.status(201).json({ purchase });
  },
);

export const getPurchaseReceiptHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { bytes, filename, mimeType } = await purchaseService.getPurchaseReceipt(
      getParamId(req),
    );
    const download = (res.locals.validatedQuery as { download?: boolean } | undefined)?.download;

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Length', String(bytes.length));
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader(
      'Content-Disposition',
      `${download ? 'attachment' : 'inline'}; filename="${encodeURIComponent(filename)}"`,
    );
    res.end(bytes);
  },
);

export const voidPurchaseHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { motivo } = req.body as VoidPurchaseInput;
    const purchase = await purchaseService.voidPurchase(
      getParamId(req),
      motivo,
      getCurrentUserId(req),
    );
    res.status(200).json({ purchase });
  },
);

export const registerPurchasePaymentHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const purchase = await purchaseService.registerPurchasePayment(
      getParamId(req),
      req.body as RegisterPurchasePaymentInput,
      getCurrentUserId(req),
    );
    res.status(200).json({ purchase });
  },
);

export const getPurchaseReportPdfHandler = asyncHandler(
  async (_req: Request, res: Response): Promise<void> => {
    const filters = res.locals.validatedQuery as PurchaseReportQueryInput;
    const pdfBytes = await generatePurchaseReportPdf(filters);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="Reporte_Compras_UNITHOR_${Date.now()}.pdf"`,
    );
    res.setHeader('Content-Length', pdfBytes.length);
    res.status(200).end(Buffer.from(pdfBytes));
  },
);

export const getPurchaseReportExcelHandler = asyncHandler(
  async (_req: Request, res: Response): Promise<void> => {
    const filters = res.locals.validatedQuery as PurchaseReportQueryInput;
    const reportBuffer = await generatePurchaseReportExcel(filters);

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="Reporte_Compras_UNITHOR_${Date.now()}.xlsx"`,
    );
    res.setHeader('Content-Length', reportBuffer.length);
    res.status(200).end(reportBuffer);
  },
);
