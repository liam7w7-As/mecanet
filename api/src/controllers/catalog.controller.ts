import * as catalogService from '../services/catalog.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

import type {
  CatalogItemQueryInput,
  CreateCatalogItemInput,
  UpdateCatalogItemInput,
  UpdateStockInput,
} from '@unithor/shared';
import type { Request, Response } from 'express';

const getParamId = (req: Request): number => Number(req.params.id);

export const getCatalogItemsHandler = asyncHandler(
  async (_req: Request, res: Response): Promise<void> => {
    const query = res.locals.validatedQuery as CatalogItemQueryInput;
    const result = await catalogService.listCatalogItems(query);
    res.status(200).json(result);
  },
);

export const getCatalogItemByIdHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const item = await catalogService.getCatalogItemById(getParamId(req));
    res.status(200).json({ item });
  },
);

export const createCatalogItemHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const item = await catalogService.createCatalogItem(req.body as CreateCatalogItemInput);
    res.status(201).json({ item });
  },
);

export const updateCatalogItemHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const item = await catalogService.updateCatalogItem(
      getParamId(req),
      req.body as UpdateCatalogItemInput,
    );
    res.status(200).json({ item });
  },
);

export const adjustStockHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const data = req.body as UpdateStockInput;
    const result = await catalogService.adjustStock(
      getParamId(req),
      data.delta,
      data.motivo,
    );
    res.status(200).json(result);
  },
);

export const deleteCatalogItemHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    await catalogService.deleteCatalogItem(getParamId(req));
    res.status(204).send();
  },
);
