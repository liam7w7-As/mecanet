import * as warehouseService from '../services/warehouse.service.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

import type {
  CreateStockMovementInput,
  CreateStockTransferInput,
  CreateWarehouseInput,
  StockMovementQueryInput,
  UpdateWarehouseInput,
  WarehouseQueryInput,
} from '@unithor/shared';
import type { Request, Response } from 'express';

const getParamId = (req: Request): number => Number(req.params.id);

const getCurrentUserId = (req: Request): number => {
  if (!req.user) {
    throw ApiError.internal('Error de programación: controlador requiere authenticate previo');
  }

  return req.user.id;
};

export const getWarehousesHandler = asyncHandler(
  async (_req: Request, res: Response): Promise<void> => {
    const query = res.locals.validatedQuery as WarehouseQueryInput;
    const result = await warehouseService.listWarehouses(query);
    res.status(200).json(result);
  },
);

export const createWarehouseHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const warehouse = await warehouseService.createWarehouse(req.body as CreateWarehouseInput);
    res.status(201).json({ warehouse });
  },
);

export const updateWarehouseHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const warehouse = await warehouseService.updateWarehouse(
      getParamId(req),
      req.body as UpdateWarehouseInput,
    );
    res.status(200).json({ warehouse });
  },
);

export const getWarehouseBalancesHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const balances = await warehouseService.getWarehouseBalances(getParamId(req));
    res.status(200).json({ balances });
  },
);

export const createStockMovementHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const movement = await warehouseService.registerMovement(
      req.body as CreateStockMovementInput,
      getCurrentUserId(req),
    );
    res.status(201).json({ movement });
  },
);

export const createStockTransferHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const result = await warehouseService.registerTransfer(
      req.body as CreateStockTransferInput,
      getCurrentUserId(req),
    );
    res.status(201).json(result);
  },
);

export const getStockMovementsHandler = asyncHandler(
  async (_req: Request, res: Response): Promise<void> => {
    const query = res.locals.validatedQuery as StockMovementQueryInput;
    const result = await warehouseService.listMovements(query);
    res.status(200).json(result);
  },
);
