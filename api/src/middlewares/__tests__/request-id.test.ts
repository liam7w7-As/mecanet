import { describe, expect, it, vi } from 'vitest';

import { requestIdMiddleware } from '../request-id.js';

import type { NextFunction, Request, Response } from 'express';

describe('requestIdMiddleware', () => {
  it('genera un UUID cuando la cabecera x-request-id no está presente', () => {
    const req = {
      headers: {},
    } as unknown as Request;

    const headersSet: Record<string, string> = {};
    const res = {
      setHeader: vi.fn((key: string, value: string) => {
        headersSet[key] = value;
      }),
      locals: {},
    } as unknown as Response;

    const next = vi.fn() as unknown as NextFunction;

    requestIdMiddleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.setHeader).toHaveBeenCalledWith(
      'X-Request-Id',
      expect.stringMatching(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      ),
    );
    expect(res.locals.requestId).toBe(headersSet['X-Request-Id']);
    expect(res.locals.logger).toBeDefined();
    expect(typeof res.locals.logger.info).toBe('function');
  });

  it('preserva la cabecera x-request-id si fue provista por el cliente', () => {
    const customId = 'req-trace-client-12345';
    const req = {
      headers: {
        'x-request-id': customId,
      },
    } as unknown as Request;

    const res = {
      setHeader: vi.fn(),
      locals: {},
    } as unknown as Response;

    const next = vi.fn() as unknown as NextFunction;

    requestIdMiddleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', customId);
    expect(res.locals.requestId).toBe(customId);
    expect(res.locals.logger).toBeDefined();
  });
});
