import * as searchService from '../services/search.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

import type { LookupByPlateInput, QuickSearchQueryInput } from '@unithor/shared';
import type { Request, Response } from 'express';

export const quickSearchHandler = asyncHandler(
  async (_req: Request, res: Response): Promise<void> => {
    const query = res.locals.validatedQuery as QuickSearchQueryInput;
    const result = await searchService.quickSearch(query.q, query.limit);
    res.status(200).json(result);
  },
);

export const lookupPlateHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const params = req.params as LookupByPlateInput;
    const result = await searchService.lookupByPlateWithClient(params.patente);
    res.status(200).json(result);
  },
);
