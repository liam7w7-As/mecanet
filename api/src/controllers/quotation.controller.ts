import * as quotationService from '../services/quotation.service.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

import type {
  ConvertQuotationInput,
  CreateQuotationInput,
  QuotationQueryInput,
  UpdateQuotationInput,
  WorkOrderInspectionPhotoSlot,
} from '@unithor/shared';
import type { Request, Response } from 'express';

const getParamId = (req: Request): number => Number(req.params.id);

const getCurrentUserId = (req: Request): number => {
  if (!req.user) {
    throw ApiError.internal('Error de programación: controlador requiere authenticate previo');
  }

  return req.user.id;
};

export const getQuotationsHandler = asyncHandler(
  async (_req: Request, res: Response): Promise<void> => {
    const query = res.locals.validatedQuery as QuotationQueryInput;
    const result = await quotationService.listQuotations(query);
    res.status(200).json(result);
  },
);

export const getQuotationByIdHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const quotation = await quotationService.getQuotationById(getParamId(req));
    res.status(200).json({ quotation });
  },
);

export const getQuotationInspectionPhotoHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { photo, bytes } = await quotationService.getQuotationInspectionPhoto(
      getParamId(req),
      req.params.slot as WorkOrderInspectionPhotoSlot,
    );
    res.setHeader('Content-Type', photo.mimeType);
    res.setHeader('Content-Length', String(bytes.length));
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('Content-Disposition', `inline; filename="inspeccion-${photo.slot}"`);
    res.end(bytes);
  },
);

export const createQuotationHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const quotation = await quotationService.createQuotation(
      req.body as CreateQuotationInput,
      getCurrentUserId(req),
    );
    res.status(201).json({ quotation });
  },
);

export const updateQuotationHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const quotation = await quotationService.updateQuotation(
      getParamId(req),
      req.body as UpdateQuotationInput,
      getCurrentUserId(req),
    );
    res.status(200).json({ quotation });
  },
);

export const convertToWorkOrderHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const result = await quotationService.convertQuotationToWorkOrder(
      getParamId(req),
      getCurrentUserId(req),
      req.body as ConvertQuotationInput,
    );
    res.status(201).json(result);
  },
);

export const deleteQuotationHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    await quotationService.deleteQuotation(getParamId(req));
    res.status(204).send();
  },
);

export const archiveQuotationHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const quotation = await quotationService.archiveQuotation(getParamId(req));
    res.status(200).json({ quotation });
  },
);
