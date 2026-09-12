import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { app } from './main.js';
import { ApiError } from './utils/ApiError.js';

describe('API Base Infrastructure', () => {
  it('GET /api/health responde 200 con status ok, timestamp y X-Request-Id', async () => {
    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('status', 'ok');
    expect(response.body).toHaveProperty('timestamp');
    expect(typeof response.body.timestamp).toBe('string');
    expect(response.headers['x-request-id']).toBeDefined();
  });

  it('preserva el X-Request-Id si es enviado en el header', async () => {
    const customRequestId = 'trace-id-123456';
    const response = await request(app).get('/api/health').set('X-Request-Id', customRequestId);

    expect(response.headers['x-request-id']).toBe(customRequestId);
  });

  it('responde 404 estandarizado en rutas no existentes', async () => {
    const response = await request(app).get('/api/ruta-inexistente');

    expect(response.status).toBe(404);
    expect(response.body.error).toEqual({
      code: 'NOT_FOUND',
      message: 'Ruta no encontrada: GET /api/ruta-inexistente',
    });
  });

  it('maneja errores de la aplicación y responde con estructura JSON estándar', async () => {
    const { apiRouter } = await import('./routes/index.js');
    apiRouter.get('/test-error', () => {
      throw ApiError.badRequest('Parámetro inválido', [{ field: 'test' }], 'TEST_ERROR');
    });

    const response = await request(app).get('/api/test-error');
    expect(response.status).toBe(400);
    expect(response.body.error).toEqual({
      code: 'TEST_ERROR',
      message: 'Parámetro inválido',
      details: [{ field: 'test' }],
    });
  });
});
