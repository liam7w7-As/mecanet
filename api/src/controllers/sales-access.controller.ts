import * as salesAccessService from '../services/sales-access-grant.service.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

import type {
  CreateRecordSalesAccessGrantInput,
  CreateSalesAccessGrantInput,
  SalesAccessRecordsQuery,
  UpdateSalesAccessInput,
} from '@unithor/shared';
import type { Request, Response } from 'express';

const getCurrentUserId = (req: Request): number => {
  if (!req.user) throw ApiError.unauthorized('No autenticado');
  return req.user.id;
};

const getParam = (req: Request, key: string): number => Number(req.params[key]);

export const listUserSalesAccessHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    res.status(200).json(await salesAccessService.getUserSalesAccess(getParam(req, 'id')));
  },
);

export const updateUserSalesAccessHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    res.status(200).json(await salesAccessService.updateUserSalesAccess(
      getParam(req, 'id'), req.body as UpdateSalesAccessInput, getCurrentUserId(req),
    ));
  },
);

export const listUserSalesAccessRecordsHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    res.status(200).json(await salesAccessService.listUserSalesAccessRecords(
      getParam(req, 'id'), res.locals.validatedQuery as SalesAccessRecordsQuery,
    ));
  },
);

export const createUserSalesAccessHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const grants = await salesAccessService.createUserSalesAccessGrant(
      getParam(req, 'id'),
      req.body as CreateSalesAccessGrantInput,
      getCurrentUserId(req),
    );
    res.status(201).json({ grants });
  },
);

export const revokeUserSalesAccessHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    await salesAccessService.revokeUserSalesAccessGrant(
      getParam(req, 'id'),
      getParam(req, 'grantId'),
    );
    res.status(204).send();
  },
);

export const listWorkOrderSalesAccessHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const grants = await salesAccessService.listRecordSalesAccessGrantees(
      'work_order',
      getParam(req, 'id'),
    );
    res.status(200).json({ grants });
  },
);

export const createWorkOrderSalesAccessHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const grants = await salesAccessService.createRecordSalesAccessGrant(
      'work_order',
      getParam(req, 'id'),
      req.body as CreateRecordSalesAccessGrantInput,
      getCurrentUserId(req),
    );
    res.status(201).json({ grants });
  },
);

export const revokeWorkOrderSalesAccessHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    await salesAccessService.revokeRecordSalesAccessGrant(
      'work_order',
      getParam(req, 'id'),
      getParam(req, 'grantId'),
    );
    res.status(204).send();
  },
);

export const listQuotationSalesAccessHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const grants = await salesAccessService.listRecordSalesAccessGrantees(
      'quotation',
      getParam(req, 'id'),
    );
    res.status(200).json({ grants });
  },
);

export const createQuotationSalesAccessHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const grants = await salesAccessService.createRecordSalesAccessGrant(
      'quotation',
      getParam(req, 'id'),
      req.body as CreateRecordSalesAccessGrantInput,
      getCurrentUserId(req),
    );
    res.status(201).json({ grants });
  },
);

export const revokeQuotationSalesAccessHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    await salesAccessService.revokeRecordSalesAccessGrant(
      'quotation',
      getParam(req, 'id'),
      getParam(req, 'grantId'),
    );
    res.status(204).send();
  },
);
