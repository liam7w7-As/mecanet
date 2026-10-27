import {
  createPurchaseSchema,
  purchaseQuerySchema,
  purchaseReportQuerySchema,
  registerPurchasePaymentSchema,
  supplierQuerySchema,
  updateSupplierSchema,
  voidPurchaseSchema,
} from '@unithor/shared';
import { Router } from 'express';
import { z } from 'zod';

import {
  createPurchaseHandler,
  getPurchaseHandler,
  getPurchaseReceiptHandler,
  getPurchaseReportExcelHandler,
  getPurchaseReportPdfHandler,
  getPurchasesHandler,
  getSupplierHandler,
  getSuppliersHandler,
  registerPurchasePaymentHandler,
  updateSupplierHandler,
  voidPurchaseHandler,
} from '../controllers/purchase.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { authorizeRoles } from '../middlewares/authorize-roles.js';
import { authorize } from '../middlewares/authorize.js';
import { purchaseUpload } from '../middlewares/purchase-upload.js';
import { validate } from '../middlewares/validate.js';

export const purchaseRouter = Router();

const idParamSchema = z.object({
  id: z.coerce.number().int().positive('ID de compra inválido'),
});

const receiptQuerySchema = z.object({
  download: z
    .enum(['true', 'false', '1', '0'])
    .transform((value) => value === 'true' || value === '1')
    .optional(),
});

purchaseRouter.use(authenticate);

purchaseRouter.get(
  '/report/pdf',
  authorize('compras', 'export'),
  validate({ query: purchaseReportQuerySchema }),
  getPurchaseReportPdfHandler,
);

purchaseRouter.get(
  '/report/excel',
  authorize('compras', 'export'),
  validate({ query: purchaseReportQuerySchema }),
  getPurchaseReportExcelHandler,
);

purchaseRouter.get(
  '/',
  authorize('compras', 'read'),
  validate({ query: purchaseQuerySchema }),
  getPurchasesHandler,
);

purchaseRouter.post(
  '/',
  authorize('compras', 'create'),
  purchaseUpload,
  validate({ body: createPurchaseSchema }),
  createPurchaseHandler,
);

purchaseRouter.get(
  '/:id/receipt',
  authorize('compras', 'read'),
  validate({ params: idParamSchema, query: receiptQuerySchema }),
  getPurchaseReceiptHandler,
);

purchaseRouter.post(
  '/:id/payment',
  authorize('compras', 'update'),
  validate({ params: idParamSchema, body: registerPurchasePaymentSchema }),
  registerPurchasePaymentHandler,
);

purchaseRouter.patch(
  '/:id/void',
  authorize('compras', 'delete'),
  authorizeRoles('admin', 'desarrollador'),
  validate({ params: idParamSchema, body: voidPurchaseSchema }),
  voidPurchaseHandler,
);

purchaseRouter.get(
  '/:id',
  authorize('compras', 'read'),
  validate({ params: idParamSchema }),
  getPurchaseHandler,
);

export const supplierRouter = Router();

const supplierIdParamSchema = z.object({
  id: z.coerce.number().int().positive('ID de proveedor inválido'),
});

supplierRouter.use(authenticate);

supplierRouter.get(
  '/',
  authorize('compras', 'read'),
  validate({ query: supplierQuerySchema }),
  getSuppliersHandler,
);

supplierRouter.get(
  '/:id',
  authorize('compras', 'read'),
  validate({ params: supplierIdParamSchema }),
  getSupplierHandler,
);

supplierRouter.patch(
  '/:id',
  authorize('compras', 'update'),
  authorizeRoles('admin', 'desarrollador'),
  validate({ params: supplierIdParamSchema, body: updateSupplierSchema }),
  updateSupplierHandler,
);
