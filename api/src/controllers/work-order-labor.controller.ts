import { generateWorkshopDailyReportPdf } from '../services/work-order-daily-report-pdf.service.js';
import * as laborService from '../services/work-order-labor.service.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

import type {
  AdjustWorkOrderItemHoursInput,
  AssignWorkOrderItemInput,
  CompleteWorkOrderItemInput,
  CreateWorkOrderObservationInput,
  CreateWorkOrderPriceSuggestionInput,
  ReviewWorkOrderPriceSuggestionInput,
  UpdateWorkOrderItemEstimateInput,
  ValidateWorkOrderItemHoursInput,
  WorkshopDailyReportQueryInput,
} from '@unithor/shared';
import type { Request, Response } from 'express';

const getCurrentUserId = (req: Request): number => {
  if (!req.user) {
    throw ApiError.internal('Error de programación: controlador requiere authenticate previo');
  }
  return req.user.id;
};

const getWorkOrderId = (req: Request): number => Number(req.params.id);
const getItemId = (req: Request): number => Number(req.params.itemId);
const getObservationId = (req: Request): number => Number(req.params.observationId);
const getFileId = (req: Request): number => Number(req.params.fileId);
const getSuggestionId = (req: Request): number => Number(req.params.suggestionId);

export const getMyLaborWorkOrdersHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const items = await laborService.listMyLaborWorkOrders(getCurrentUserId(req));
    res.status(200).json({ items });
  },
);

export const getWorksheetHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const worksheet = await laborService.getWorkOrderWorksheet(
      getWorkOrderId(req),
      getCurrentUserId(req),
    );
    res.status(200).json({ worksheet });
  },
);

export const startItemTimerHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const worksheet = await laborService.startItemTimer(
      getWorkOrderId(req),
      getItemId(req),
      getCurrentUserId(req),
    );
    res.status(200).json({ worksheet });
  },
);

export const pauseItemTimerHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const worksheet = await laborService.pauseItemTimer(
      getWorkOrderId(req),
      getItemId(req),
      getCurrentUserId(req),
    );
    res.status(200).json({ worksheet });
  },
);

export const completeItemTimerHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const data = req.body as CompleteWorkOrderItemInput;
    const worksheet = await laborService.completeItemTimer(
      getWorkOrderId(req),
      getItemId(req),
      getCurrentUserId(req),
      data.notasOperativas,
    );
    res.status(200).json({ worksheet });
  },
);

export const assignWorkOrderItemHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const data = req.body as AssignWorkOrderItemInput;
    const worksheet = await laborService.assignWorkOrderItem(
      getWorkOrderId(req),
      getItemId(req),
      data.assignedUserId,
      getCurrentUserId(req),
    );
    res.status(200).json({ worksheet });
  },
);

export const updateItemEstimateHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const data = req.body as UpdateWorkOrderItemEstimateInput;
    const worksheet = await laborService.updateItemEstimate(
      getWorkOrderId(req),
      getItemId(req),
      data.horasHombreEstimadas ?? null,
      getCurrentUserId(req),
    );
    res.status(200).json({ worksheet });
  },
);

export const adjustItemHoursHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const data = req.body as AdjustWorkOrderItemHoursInput;
    const worksheet = await laborService.adjustItemHours(
      getWorkOrderId(req),
      getItemId(req),
      data.minutos,
      data.motivo,
      getCurrentUserId(req),
    );
    res.status(200).json({ worksheet });
  },
);

export const validateItemHoursHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const data = req.body as ValidateWorkOrderItemHoursInput;
    const worksheet = await laborService.validateItemHours(
      getWorkOrderId(req),
      getItemId(req),
      data.comentario,
      getCurrentUserId(req),
    );
    res.status(200).json({ worksheet });
  },
);

export const getObservationsHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const worksheet = await laborService.getWorkOrderWorksheet(
      getWorkOrderId(req),
      getCurrentUserId(req),
    );
    res.status(200).json({ observations: worksheet.observations });
  },
);

export const createObservationHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const files = Array.isArray(req.files) ? req.files : [];
    const worksheet = await laborService.createObservation(
      getWorkOrderId(req),
      req.body as CreateWorkOrderObservationInput,
      files,
      getCurrentUserId(req),
    );
    res.status(201).json({ worksheet });
  },
);

export const getObservationFileHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const file = await laborService.getObservationFile(
      getWorkOrderId(req),
      getObservationId(req),
      getFileId(req),
      getCurrentUserId(req),
    );
    const filename = file.nombreOriginal.replace(/["\r\n]/g, '_');
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Length', String(file.bytes.length));
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.status(200).end(file.bytes);
  },
);

export const listPriceSuggestionsHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const suggestions = await laborService.listPriceSuggestions(
      getWorkOrderId(req),
      getCurrentUserId(req),
    );
    res.status(200).json({ suggestions });
  },
);

export const createPriceSuggestionHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const suggestion = await laborService.createPriceSuggestion(
      getWorkOrderId(req),
      req.body as CreateWorkOrderPriceSuggestionInput,
      getCurrentUserId(req),
    );
    res.status(201).json({ suggestion });
  },
);

export const reviewPriceSuggestionHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const suggestion = await laborService.reviewPriceSuggestion(
      getWorkOrderId(req),
      getSuggestionId(req),
      req.body as ReviewWorkOrderPriceSuggestionInput,
      getCurrentUserId(req),
    );
    res.status(200).json({ suggestion });
  },
);

export const getWorkshopDailyReportHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const query = res.locals.validatedQuery as WorkshopDailyReportQueryInput;
    const report = await laborService.getWorkshopDailyReport(query.fecha, getCurrentUserId(req));
    res.status(200).json({ report });
  },
);

export const getWorkshopDailyReportPdfHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const query = res.locals.validatedQuery as WorkshopDailyReportQueryInput;
    const report = await laborService.getWorkshopDailyReport(query.fecha, getCurrentUserId(req));
    const pdf = await generateWorkshopDailyReportPdf(report);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="reporte-diario-taller-${report.fecha}.pdf"`,
    );
    res.end(Buffer.from(pdf));
  },
);
