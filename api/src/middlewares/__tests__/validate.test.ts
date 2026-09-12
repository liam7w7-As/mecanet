import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { ApiError } from '../../utils/ApiError.js';
import { validate } from '../validate.js';

import type { NextFunction, Request, Response } from 'express';

describe('validate middleware', () => {
  it('valida body correctamente y transforma datos con zod', async () => {
    const schema = {
      body: z.object({
        name: z.string().trim(),
        age: z.coerce.number(),
      }),
    };

    const req = {
      body: { name: '  Carlos  ', age: '30' },
    } as unknown as Request;
    const res = { locals: {} } as Response;
    const next = vi.fn() as unknown as NextFunction;

    const middleware = validate(schema);
    await middleware(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.body).toEqual({ name: 'Carlos', age: 30 });
  });

  it('valida query correctamente y asigna a req.query y res.locals.validatedQuery', async () => {
    const schema = {
      query: z.object({
        page: z.coerce.number().default(1),
        limit: z.coerce.number().default(10),
      }),
    };

    const req = {
      query: { page: '2' },
    } as unknown as Request;
    const res = { locals: {} } as Response;
    const next = vi.fn() as unknown as NextFunction;

    const middleware = validate(schema);
    await middleware(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.query).toEqual({ page: 2, limit: 10 });
    expect(res.locals.validatedQuery).toEqual({ page: 2, limit: 10 });
  });

  it('valida params correctamente', async () => {
    const schema = {
      params: z.object({
        id: z.coerce.number().positive(),
      }),
    };

    const req = {
      params: { id: '42' },
    } as unknown as Request;
    const res = { locals: {} } as Response;
    const next = vi.fn() as unknown as NextFunction;

    const middleware = validate(schema);
    await middleware(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(req.params).toEqual({ id: 42 });
  });

  it('pasa un ApiError con código VALIDATION_ERROR y detalles a next() cuando los datos no cumplen el schema', async () => {
    const schema = {
      body: z.object({
        email: z.string().email('Email inválido'),
      }),
    };

    const req = {
      body: { email: 'no-es-un-email' },
    } as unknown as Request;
    const res = { locals: {} } as Response;
    const next = vi.fn() as unknown as NextFunction;

    const middleware = validate(schema);
    await middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    const errorPassed = (next as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0];
    expect(errorPassed).toBeInstanceOf(ApiError);
    const apiError = errorPassed as ApiError;
    expect(apiError.statusCode).toBe(400);
    expect(apiError.code).toBe('VALIDATION_ERROR');
    expect(apiError.details).toEqual([{ field: 'email', message: 'Email inválido' }]);
  });
});
