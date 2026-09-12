import { randomUUID } from 'node:crypto';

import { childLogger } from '../utils/logger.js';

import type { NextFunction, Request, Response } from 'express';

export const requestIdMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const headerId = req.headers['x-request-id'];
  const requestId =
    typeof headerId === 'string' && headerId.trim().length > 0 ? headerId.trim() : randomUUID();

  res.setHeader('X-Request-Id', requestId);
  res.locals.requestId = requestId;
  res.locals.logger = childLogger(requestId);

  next();
};
