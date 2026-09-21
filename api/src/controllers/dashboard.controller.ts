import { getDashboardSummary } from '../services/dashboard.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

import type { Request, Response } from 'express';

export const getDashboardSummaryHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      throw new Error('getDashboardSummaryHandler requiere authenticate previo');
    }
    const summary = await getDashboardSummary(req.user.id);
    res.status(200).json(summary);
  },
);
