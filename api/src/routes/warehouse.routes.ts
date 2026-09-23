import {
  createStockMovementSchema,
  createStockTransferSchema,
  createWarehouseSchema,
  stockMovementQuerySchema,
  updateWarehouseSchema,
  warehouseQuerySchema,
} from '@unithor/shared';
import { Router } from 'express';
import { z } from 'zod';

import {
  createStockMovementHandler,
  createStockTransferHandler,
  createWarehouseHandler,
  getStockMovementsHandler,
  getWarehouseBalancesHandler,
  getWarehousesHandler,
  updateWarehouseHandler,
} from '../controllers/warehouse.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { authorize } from '../middlewares/authorize.js';
import { validate } from '../middlewares/validate.js';

export const warehouseRouter = Router();

const idParamSchema = z.object({
  id: z.coerce.number().int().positive('ID de almacén inválido'),
});

warehouseRouter.use(authenticate);

warehouseRouter.get(
  '/',
  authorize('almacen', 'read'),
  validate({ query: warehouseQuerySchema }),
  getWarehousesHandler,
);

warehouseRouter.post(
  '/',
  authorize('almacen', 'create'),
  validate({ body: createWarehouseSchema }),
  createWarehouseHandler,
);

warehouseRouter.patch(
  '/:id',
  authorize('almacen', 'update'),
  validate({ params: idParamSchema, body: updateWarehouseSchema }),
  updateWarehouseHandler,
);

warehouseRouter.get(
  '/movements/all',
  authorize('almacen', 'read'),
  validate({ query: stockMovementQuerySchema }),
  getStockMovementsHandler,
);

warehouseRouter.get(
  '/:id/balances',
  authorize('almacen', 'read'),
  validate({ params: idParamSchema }),
  getWarehouseBalancesHandler,
);

warehouseRouter.post(
  '/movements',
  authorize('almacen', 'create'),
  validate({ body: createStockMovementSchema }),
  createStockMovementHandler,
);

warehouseRouter.post(
  '/transfers',
  authorize('almacen', 'create'),
  validate({ body: createStockTransferSchema }),
  createStockTransferHandler,
);
