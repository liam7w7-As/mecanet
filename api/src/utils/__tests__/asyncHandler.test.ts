import { describe, expect, it, vi } from 'vitest';

import { asyncHandler } from '../asyncHandler.js';

import type { NextFunction, Request, Response } from 'express';

describe('asyncHandler', () => {
  it('ejecuta la función asíncrona exitosamente sin invocar next con error', async () => {
    const req = {} as Request;
    const res = {
      json: vi.fn(),
    } as unknown as Response;
    const next = vi.fn() as unknown as NextFunction;

    const handler = asyncHandler(async (_req, response) => {
      response.json({ ok: true });
    });

    await handler(req, res, next);

    expect(res.json).toHaveBeenCalledWith({ ok: true });
    expect(next).not.toHaveBeenCalled();
  });

  it('captura un error asíncrono y lo pasa a next()', async () => {
    const req = {} as Request;
    const res = {} as Response;
    const next = vi.fn() as unknown as NextFunction;
    const testError = new Error('Async boom');

    const handler = asyncHandler(async () => {
      throw testError;
    });

    await handler(req, res, next);

    expect(next).toHaveBeenCalledWith(testError);
  });
});
