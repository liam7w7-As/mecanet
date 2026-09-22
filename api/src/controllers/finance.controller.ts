import { closeCashDay, getDailyCashSummary } from '../services/cash-closure.service.js';
import { getFinanceSummary } from '../services/finance.service.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

import type { CloseCashDayInput, FinanceDayQueryInput } from '@unithor/shared';
import type { Request, Response } from 'express';

export const getFinanceSummaryHandler = asyncHandler(
  async (_req: Request, res: Response): Promise<void> => {
    res.status(200).json(await getFinanceSummary());
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
