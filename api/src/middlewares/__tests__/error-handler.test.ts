import { UniqueConstraintError, ValidationError, ValidationErrorItem } from 'sequelize';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { ApiError } from '../../utils/ApiError.js';
import { errorHandler } from '../error-handler.js';

import type { NextFunction, Request, Response } from 'express';

describe('errorHandler middleware', () => {
  const mockReq = {
    method: 'POST',
    originalUrl: '/api/test',
  } as Request;

  const createMockRes = () => {
    const res = {
      statusCode: 200,
      jsonBody: null as unknown,
      status: vi.fn().mockImplementation(function (this: unknown, code: number) {
        (res as { statusCode: number }).statusCode = code;
        return res;
      }),
      json: vi.fn().mockImplementation(function (this: unknown, data: unknown) {
        (res as { jsonBody: unknown }).jsonBody = data;
        return res;
      }),
      locals: {},
    } as unknown as Response & { statusCode: number; jsonBody: unknown };
    return res;
  };

  const next = vi.fn() as unknown as NextFunction;

  it('maneja ApiError respetando statusCode, code, message y details', () => {
    const res = createMockRes();
    const error = ApiError.conflict('El email ya está en uso', 'EMAIL_TAKEN', {
      email: 'test@unithor.com',
    });

    errorHandler(error, mockReq, res, next);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.jsonBody).toEqual({
      error: {
        code: 'EMAIL_TAKEN',
        message: 'El email ya está en uso',
        details: { email: 'test@unithor.com' },
      },
    });
  });

  it('maneja ZodError devolviendo 400 VALIDATION_ERROR y detalles formateados', () => {
    const res = createMockRes();
    const schema = z.object({
      age: z.number().min(18),
    });

    let zodError: unknown;
    try {
      schema.parse({ age: 10 });
    } catch (e) {
      zodError = e;
    }

    errorHandler(zodError, mockReq, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    const body = res.jsonBody as {
      error: { code: string; message: string; details: { field: string; message: string }[] };
    };
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toBe('Error de validación');
    expect(body.error.details).toBeDefined();
    expect(body.error.details[0].field).toBe('age');
  });

  it('maneja Sequelize UniqueConstraintError devolviendo 409 CONFLICT', () => {
    const res = createMockRes();
    const item = new ValidationErrorItem(
      'codigo must be unique',
      'unique violation',
      'codigo',
      'OT-2026-0001',
      {} as never,
      'codigo_UNIQUE',
      'codigo_UNIQUE',
      [],
    );
    const uniqueError = new UniqueConstraintError({
      errors: [item],
      fields: { codigo: 'OT-2026-0001' },
    });

    errorHandler(uniqueError, mockReq, res, next);

    expect(res.status).toHaveBeenCalledWith(409);
    const body = res.jsonBody as {
      error: { code: string; message: string; details: { field: string; message: string }[] };
    };
    expect(body.error.code).toBe('CONFLICT');
    expect(body.error.message).toBe('Registro duplicado: ya existe un registro con esos datos');
    expect(body.error.details[0].field).toBe('codigo');
  });

  it('maneja Sequelize ValidationError devolviendo 400 VALIDATION_ERROR', () => {
    const res = createMockRes();
    const item = new ValidationErrorItem(
      'Validation isEmail on email failed',
      'validation error',
      'email',
      'bad-email',
      {} as never,
      'isEmail',
      'isEmail',
      [],
    );
    const validationError = new ValidationError('Validation error', [item]);

    errorHandler(validationError, mockReq, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    const body = res.jsonBody as {
      error: { code: string; message: string; details: { field: string; message: string }[] };
    };
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details[0].field).toBe('email');
  });

  it('maneja errores genéricos no controlados con 500 INTERNAL_SERVER_ERROR', () => {
    const res = createMockRes();
    const genericError = new Error('Database disk failed');

    errorHandler(genericError, mockReq, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    const body = res.jsonBody as { error: { code: string; message: string } };
    expect(body.error.code).toBe('INTERNAL_SERVER_ERROR');
    expect(body.error.message).toBe('Error interno del servidor');
  });
});
