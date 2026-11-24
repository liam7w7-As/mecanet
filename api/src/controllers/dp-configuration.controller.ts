import * as dpService from '../services/dp-configuration.service.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

import type { DpQuoteInput, UpdateDpConfigurationInput } from '@unithor/shared';

export const getDpConfigurationHandler = asyncHandler(async (_req, res) => {
  res.set('Cache-Control', 'no-store').json(await dpService.getDpConfiguration());
});

export const getDpConfigurationHistoryHandler = asyncHandler(async (_req, res) => {
  res.set('Cache-Control', 'no-store').json(await dpService.getDpConfigurationHistory());
});

export const updateDpConfigurationHandler = asyncHandler(async (req, res) => {
  if (!req.user) throw ApiError.unauthorized();
  res.json(
    await dpService.updateDpConfiguration(req.body as UpdateDpConfigurationInput, req.user.id),
  );
});

export const calculateDpQuoteHandler = asyncHandler(async (req, res) => {
  res.json({ quote: await dpService.calculateDpWorkPricing(req.body as DpQuoteInput) });
});
