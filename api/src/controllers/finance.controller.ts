import { getFinanceSummary } from '../services/finance.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

import type { Request, Response } from 'express';

export const getFinanceSummaryHandler = asyncHandler(
  async (_req: Request, res: Response): Promise<void> => {
    res.status(200).json(await getFinanceSummary());
  },
);
