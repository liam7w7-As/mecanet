import { subscribeCatalogChanges } from '../services/catalog-events.service.js';
import * as catalogService from '../services/catalog.service.js';
import { hasPermission } from '../services/permission.service.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { verifyAccessToken } from '../utils/jwt.js';

import type {
  CatalogItemQueryInput,
  CreateCatalogItemInput,
  UpdateCatalogItemInput,
  UpdateStockInput,
} from '@unithor/shared';
import type { Request, Response } from 'express';

const getParamId = (req: Request): number => Number(req.params.id);

export const getCatalogEventsHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    if (!req.user) throw ApiError.unauthorized('No autenticado');
    const userId = req.user.id;
    const token: unknown = req.cookies?.access_token;
    let closed = false;
    let checking = false;
    let pendingRevision: string | undefined;
    const timers: {
      heartbeat?: ReturnType<typeof setInterval>;
      lifetime?: ReturnType<typeof setTimeout>;
    } = {};
    let unsubscribe = (): void => {};
    const close = (): void => {
      if (closed) return;
      closed = true;
      clearInterval(timers.heartbeat);
      clearTimeout(timers.lifetime);
      unsubscribe();
      res.off('close', close);
      req.off('aborted', close);
      if (!res.writableEnded) res.end();
    };
    const flush = async (): Promise<void> => {
      if (closed || checking) return;
      checking = true;
      const revision = pendingRevision;
      pendingRevision = undefined;
      try {
        if (typeof token !== 'string' || verifyAccessToken(token).sub !== userId) {
          close();
          return;
        }
        const permissions = await Promise.all([
          hasPermission(userId, 'taller', 'read'),
          hasPermission(userId, 'comercial', 'read'),
        ]);
        if (closed) return;
        if (!permissions.some(Boolean)) {
          close();
          return;
        }
        const accepted = res.write(revision
          ? `event: catalog-changed\ndata: ${JSON.stringify({ revision })}\n\n`
          : ': heartbeat\n\n');
        if (!accepted) close();
      } catch {
        close();
      } finally {
        checking = false;
        if (!closed && pendingRevision) void flush();
      }
    };

    res.status(200).set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, no-transform',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    res.on('close', close);
    req.on('aborted', close);
    unsubscribe = subscribeCatalogChanges((revision) => {
      pendingRevision = revision;
      void flush();
    });
    timers.heartbeat = setInterval(() => { void flush(); }, 15_000);
    // Reconnect periodically to renew cookie authentication and refetch after a
    // deployment/reconnection, including when the load balancer changes workers.
    timers.lifetime = setTimeout(close, 55_000);
    timers.heartbeat.unref();
    timers.lifetime.unref();
    res.write('event: ready\ndata: {}\n\n');
  },
);

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
    const item = await catalogService.createCatalogItem(
      req.body as CreateCatalogItemInput,
      req.user?.id,
    );
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
      req.user?.id,
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
