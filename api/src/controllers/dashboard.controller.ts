import { getDashboardSummary } from '../services/dashboard.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

import type { Request, Response } from 'express';

export const getDashboardSummaryHandler = asyncHandler(
  async (_req: Request, res: Response): Promise<void> => {
    const summary = await getDashboardSummary();
    res.status(200).json(summary);
  },
);
