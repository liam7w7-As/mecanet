import { closeCashDay, getDailyCashSummary } from '../services/cash-closure.service.js';
import {
  createCashMovement,
  listCashMovements,
  voidCashMovement,
} from '../services/cash-movement.service.js';
import { getFinanceSummary } from '../services/finance.service.js';
import { getFinancialAnalytics } from '../services/financial-analytics.service.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

import type {
  CloseCashDayInput,
  CreateCashMovementInput,
  FinanceDayQueryInput,
  FinancialReportFilters,
  VoidCashMovementInput,
} from '@unithor/shared';
import type { Request, Response } from 'express';

export const getFinanceSummaryHandler = asyncHandler(
  async (_req: Request, res: Response): Promise<void> => {
    res.status(200).json(await getFinanceSummary());
  },
);

export const getFinancialAnalyticsHandler = asyncHandler(
  async (_req: Request, res: Response): Promise<void> => {
    const filters = res.locals.validatedQuery as FinancialReportFilters;
    res.status(200).json(await getFinancialAnalytics(filters));
  },
);

export const getDailyCashSummaryHandler = asyncHandler(
  async (_req: Request, res: Response): Promise<void> => {
    const query = res.locals.validatedQuery as FinanceDayQueryInput;
    res.status(200).json(await getDailyCashSummary(query.fecha));
  },
);

export const closeCashDayHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      throw ApiError.internal('El cierre de caja requiere authenticate previo');
    }
    const result = await closeCashDay(req.body as CloseCashDayInput, req.user.id);
    res.status(201).json(result);
  },
);

export const getCashMovementsHandler = asyncHandler(
  async (_req: Request, res: Response): Promise<void> => {
    const query = res.locals.validatedQuery as FinanceDayQueryInput;
    res.status(200).json({ items: await listCashMovements(query.fecha) });
  },
);

export const createCashMovementHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      throw ApiError.internal('El movimiento de caja requiere authenticate previo');
    }
    const movement = await createCashMovement(
      req.body as CreateCashMovementInput,
      req.user.id,
    );
    res.status(201).json({ movement });
  },
);

export const voidCashMovementHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      throw ApiError.internal('La anulación requiere authenticate previo');
    }
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) throw ApiError.badRequest('ID de movimiento inválido');
    const data = req.body as VoidCashMovementInput;
    const movement = await voidCashMovement(id, data.motivo, req.user.id);
    res.status(200).json({ movement });
  },
);
