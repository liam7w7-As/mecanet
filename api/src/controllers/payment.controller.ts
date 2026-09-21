import * as paymentService from '../services/payment.service.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

import type { CreatePaymentInput, PaymentQueryInput, VerifyPaymentInput } from '@unithor/shared';
import type { Request, Response } from 'express';

const getParamId = (req: Request): number => Number(req.params.id);

const getCurrentUserId = (req: Request): number => {
  if (!req.user) {
    throw ApiError.internal('Error de programación: controlador requiere authenticate previo');
  }

  return req.user.id;
};

export const getPaymentsHandler = asyncHandler(
  async (_req: Request, res: Response): Promise<void> => {
    const query = res.locals.validatedQuery as PaymentQueryInput;
    const result = await paymentService.listPayments(query);
    res.status(200).json(result);
  },
);

export const getQuotationPaymentsHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const result = await paymentService.getPaymentsByQuotationId(getParamId(req));
    res.status(200).json(result);
  },
);

export const createPaymentHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const result = await paymentService.createPayment(
      req.body as CreatePaymentInput,
      getCurrentUserId(req),
    );
    res.status(201).json(result);
  },
);

export const deletePaymentHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const result = await paymentService.deletePayment(getParamId(req));
    res.status(200).json(result);
  },
);

export const verifyPaymentHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const result = await paymentService.verifyPayment(
      getParamId(req),
      req.body as VerifyPaymentInput,
      getCurrentUserId(req),
    );
    res.status(200).json(result);
  },
);
