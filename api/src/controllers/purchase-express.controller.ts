import { completeExpressExpense, createExpressExpense, listExpenseFleetVehicles } from '../services/purchase-expense.service.js';
import { returnExpressPurchaseToStock } from '../services/purchase-express-reversal.js';
import {
  createExpressPurchase,
  listExpressOrders,
  listExpressRequests,
} from '../services/purchase-express.service.js';
import { scanPurchaseReceipt } from '../services/purchase-scan.service.js';
import { confirmExpressPurchase, getPurchaseById, listPurchaseCreators } from '../services/purchase.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

import type { CompleteExpressExpenseInput, CreateExpressExpenseInput, CreateExpressPurchaseSubmission, ReturnExpressPurchaseInput } from '@unithor/shared';

export const expressRequestsHandler = asyncHandler(async (req, res) => {
  const { search } = res.locals.validatedQuery as { search?: string };
  res.json(await listExpressRequests(search, req.user!.id));
});
export const expressOrdersHandler = asyncHandler(async (req, res) => {
  const { search } = res.locals.validatedQuery as { search?: string };
  res.json(await listExpressOrders(search, req.user!.id, req.path === '/express/completion-orders'));
});
export const expressScanHandler = asyncHandler(async (req, res) => {
  res.json(await scanPurchaseReceipt(req.file, req.user!.id));
});
export const expressCreateHandler = asyncHandler(async (req, res) => {
  const purchase = await createExpressPurchase(
    req.body as CreateExpressPurchaseSubmission,
    req.user!.id,
    req.file,
  );
  res.status(201).json({ purchase });
});

export const expressFleetHandler = asyncHandler(async (_req, res) => {
  const { search } = res.locals.validatedQuery as { search?: string };
  res.json({ items: await listExpenseFleetVehicles(search) });
});

export const expressExpenseHandler = asyncHandler(async (req, res) => {
  const purchase = await createExpressExpense(req.body as CreateExpressExpenseInput, req.user!, req.file);
  res.status(201).json({ purchase });
});

export const expressCompleteHandler = asyncHandler(async (req, res) => {
  const purchase = await completeExpressExpense(Number(req.params.id), req.body as CompleteExpressExpenseInput, req.user!, req.file);
  res.json({ purchase });
});

export const expressConfirmHandler = asyncHandler(async (req, res) => {
  res.json({ purchase: await confirmExpressPurchase(Number(req.params.id), req.user!) });
});

export const purchaseCreatorsHandler = asyncHandler(async (req, res) => {
  res.json({ items: await listPurchaseCreators(req.user!) });
});

export const expressReturnToStockHandler = asyncHandler(async (req, res) => {
  const { motivo, itemIds } = req.body as ReturnExpressPurchaseInput;
  await getPurchaseById(Number(req.params.id), req.user!);
  const purchase = await returnExpressPurchaseToStock(Number(req.params.id), motivo, req.user!.id, itemIds);
  res.json({ purchase });
});
