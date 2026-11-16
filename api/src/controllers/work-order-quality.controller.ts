import { getWorkOrderQuality, reviewWorkOrderQuality } from '../services/work-order-quality.service.js';
import { changeStatus } from '../services/work-order.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

import type { ConfirmWorkOrderQualityInput, ReviewWorkOrderQualityInput } from '@unithor/shared';

export const getWorkOrderQualityHandler = asyncHandler(async (req, res) => {
  res.json({ quality: await getWorkOrderQuality(Number(req.params.id), req.user!.id) });
});
export const reviewWorkOrderQualityHandler = asyncHandler(async (req, res) => {
  res.json({ quality: await reviewWorkOrderQuality(Number(req.params.id), Number(req.params.itemId), req.body as ReviewWorkOrderQualityInput, req.user!.id) });
});
export const confirmWorkOrderQualityHandler = asyncHandler(async (req, res) => {
  const data = req.body as ConfirmWorkOrderQualityInput;
  await changeStatus(Number(req.params.id), 'finalizada', req.user!.id, data.notas);
  res.json({ quality: await getWorkOrderQuality(Number(req.params.id), req.user!.id) });
});
