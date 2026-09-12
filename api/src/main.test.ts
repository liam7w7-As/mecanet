import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { app } from './main.js';

describe('GET /api/health', () => {
  it('responde 200 con status ok y timestamp', async () => {
    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('status', 'ok');
    expect(response.body).toHaveProperty('timestamp');
    expect(typeof response.body.timestamp).toBe('string');
  });

  it('responde 404 en rutas no existentes', async () => {
    const response = await request(app).get('/api/ruta-inexistente');

    expect(response.status).toBe(404);
    expect(response.body.error).toHaveProperty('code', 'NOT_FOUND');
  });
});
