import * as workOrderService from '../services/work-order.service.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

import type {
  CreateWorkOrderInput,
  UpdateWorkOrderInput,
  WorkOrderQueryInput,
} from '@unithor/shared';
import type { Request, Response } from 'express';

const getParamId = (req: Request): number => Number(req.params.id);

const getCurrentUserId = (req: Request): number => {
  if (!req.user) {
    throw ApiError.internal('Error de programación: controlador requiere authenticate previo');
  }

  return req.user.id;
};

export const getWorkOrdersHandler = asyncHandler(
  async (_req: Request, res: Response): Promise<void> => {
    const query = res.locals.validatedQuery as WorkOrderQueryInput;
    const result = await workOrderService.listWorkOrders(query);
    res.status(200).json(result);
  },
);

export const getWorkOrderByIdHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const workOrder = await workOrderService.getWorkOrderById(getParamId(req));
    res.status(200).json({ workOrder });
  },
);

export const createWorkOrderHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const workOrder = await workOrderService.createWorkOrder(
      req.body as CreateWorkOrderInput,
      getCurrentUserId(req),
    );
    res.status(201).json({ workOrder });
  },
);

export const updateWorkOrderHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const workOrder = await workOrderService.updateWorkOrder(
      getParamId(req),
      req.body as UpdateWorkOrderInput,
    );
    res.status(200).json({ workOrder });
  },
);

export const deleteWorkOrderHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    await workOrderService.deleteWorkOrder(getParamId(req));
    res.status(204).send();
  },
);
