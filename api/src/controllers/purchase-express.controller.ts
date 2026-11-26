import { returnExpressPurchaseToStock } from '../services/purchase-express-reversal.js';
import {
  createExpressPurchase,
  listExpressOrders,
  listExpressRequests,
} from '../services/purchase-express.service.js';
import { scanPurchaseReceipt } from '../services/purchase-scan.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

import type { CreateExpressPurchaseInput } from '@unithor/shared';

export const expressRequestsHandler = asyncHandler(async (req, res) => {
  const { search } = res.locals.validatedQuery as { search?: string };
  res.json(await listExpressRequests(search, req.user!.id));
});
export const expressOrdersHandler = asyncHandler(async (req, res) => {
  const { search } = res.locals.validatedQuery as { search?: string };
  res.json(await listExpressOrders(search, req.user!.id));
});
export const expressScanHandler = asyncHandler(async (req, res) => {
  res.json(await scanPurchaseReceipt(req.file, req.user!.id));
});
export const expressCreateHandler = asyncHandler(async (req, res) => {
  const purchase = await createExpressPurchase(
    req.body as CreateExpressPurchaseInput,
    req.user!.id,
    req.file,
  );
  res.status(201).json({ purchase });
});

export const expressReturnToStockHandler = asyncHandler(async (req, res) => {
  const { motivo } = req.body as { motivo: string };
  const purchase = await returnExpressPurchaseToStock(Number(req.params.id), motivo, req.user!.id);
  res.json({ purchase });
});
