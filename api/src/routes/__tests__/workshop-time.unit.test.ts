import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { hasPermission } from '../../services/permission.service.js';
import {
  createWorkshopTimeRequest,
  getWorkshopTimeEligibleItems,
  getWorkshopTimeJournal,
  reviewWorkshopTimeRequest,
} from '../../services/workshop-time.service.js';
import { ApiError } from '../../utils/ApiError.js';
import { workshopTimeRouter } from '../workshop-time.routes.js';

import type { ErrorRequestHandler, NextFunction, Request, Response } from 'express';

vi.mock('../../middlewares/authenticate.js', () => ({
  authenticate: (req: Request, _res: Response, next: NextFunction): void => {
    const role = req.header('x-test-role');
    if (role)
      req.user = {
        id: role === 'mecanico' ? 9 : 1,
        role,
        nombre: 'Prueba',
        email: 'test@example.invalid',
      };
    next(role ? undefined : ApiError.unauthorized());
  },
}));
vi.mock('../../services/permission.service.js', () => ({ hasPermission: vi.fn() }));
vi.mock('../../services/workshop-time.service.js', () => ({
  createWorkshopTimeRequest: vi.fn(),
  getWorkshopTimeEligibleItems: vi.fn(),
  getWorkshopTimeJournal: vi.fn(),
  reviewWorkshopTimeRequest: vi.fn(),
}));

const app = express();
app.use(express.json());
app.use('/api/workshop-time', workshopTimeRouter);
const errors: ErrorRequestHandler = (error: unknown, _req, res, _next): void => {
  const failure = error instanceof ApiError ? error : ApiError.internal();
  res.status(failure.statusCode).json({ error: { code: failure.code, message: failure.message } });
};
app.use(errors);
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(hasPermission).mockResolvedValue(true);
  vi.mocked(getWorkshopTimeJournal).mockResolvedValue({
    date: '2025-10-04',
    entries: [],
    requests: [],
    workers: [],
    totals: {
      registeredMinutes: 0,
      pendingMinutes: 0,
      scheduledMinutes: null,
      unregisteredMinutes: null,
    },
  });
  vi.mocked(getWorkshopTimeEligibleItems).mockResolvedValue([]);
});

describe('Workshop time router without database setup', () => {
  it('requires authentication and explicit workshop roles even when module permissions allow', async () => {
    expect((await request(app).get('/api/workshop-time?fecha=2025-10-04')).status).toBe(401);
    for (const role of ['vendedor', 'bodeguero', 'finanzas']) {
      expect(
        (await request(app).get('/api/workshop-time?fecha=2025-10-04').set('x-test-role', role))
          .status,
      ).toBe(403);
    }
    expect(getWorkshopTimeJournal).not.toHaveBeenCalled();
  });
  it('enforces taller read and update permissions independently', async () => {
    vi.mocked(hasPermission).mockResolvedValue(false);
    expect(
      (await request(app).get('/api/workshop-time?fecha=2025-10-04').set('x-test-role', 'mecanico'))
        .status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post('/api/workshop-time/requests')
          .set('x-test-role', 'mecanico')
          .send({})
      ).status,
    ).toBe(403);
    expect(hasPermission).toHaveBeenCalledWith(9, 'taller', 'read');
    expect(hasPermission).toHaveBeenCalledWith(9, 'taller', 'update');
  });
  it('exposes the direct journal and safe selector contracts with authenticated actor scope', async () => {
    const result = await request(app)
      .get('/api/workshop-time?fecha=2025-10-04')
      .set('x-test-role', 'mecanico');
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      date: '2025-10-04',
      entries: [],
      requests: [],
      totals: { scheduledMinutes: null },
    });
    expect(getWorkshopTimeJournal).toHaveBeenCalledWith(
      { id: 9, role: 'mecanico' },
      { fecha: '2025-10-04' },
    );
    const eligible = await request(app)
      .get('/api/workshop-time/eligible-items?userId=9')
      .set('x-test-role', 'jefe');
    expect(eligible.body).toEqual({ items: [] });
    expect(getWorkshopTimeEligibleItems).toHaveBeenCalledWith({ id: 1, role: 'jefe' }, 9, undefined);
  });
  it('validates interval payloads before calling persistence', async () => {
    const result = await request(app)
      .post('/api/workshop-time/requests')
      .set('x-test-role', 'mecanico')
      .send({
        workOrderId: 12,
        itemId: 20,
        startedAt: '2025-10-04T12:00:00Z',
        endedAt: '2025-10-04T13:00:00Z',
        note: ' ',
      });
    expect(result.status).toBe(400);
    expect(createWorkshopTimeRequest).not.toHaveBeenCalled();
  });
  it('validates and forwards the selected eligible date without coercing impossible dates', async () => {
    expect((await request(app).get('/api/workshop-time/eligible-items?fecha=2026-02-30').set('x-test-role', 'mecanico')).status).toBe(400);
    expect(getWorkshopTimeEligibleItems).not.toHaveBeenCalled();
    expect((await request(app).get('/api/workshop-time/eligible-items?fecha=2025-10-04').set('x-test-role', 'mecanico')).status).toBe(200);
    expect(getWorkshopTimeEligibleItems).toHaveBeenCalledWith({ id: 9, role: 'mecanico' }, undefined, '2025-10-04');
  });
  it('keeps optional activity compatible but forbids state injection on corrections', async () => {
    const data = { workOrderId: 12, itemId: 20, startedAt: '2025-10-04T12:00:00Z', endedAt: '2025-10-04T13:00:00Z', note: 'Diagnóstico realizado', activityStatus: 'completado' };
    expect((await request(app).post('/api/workshop-time/requests').set('x-test-role', 'mecanico').send(data)).status).toBe(201);
    expect(createWorkshopTimeRequest).toHaveBeenCalledWith({ id: 9, role: 'mecanico' }, expect.objectContaining({ activityStatus: 'completado' }));
    vi.mocked(createWorkshopTimeRequest).mockClear();
    expect((await request(app).post('/api/workshop-time/requests').set('x-test-role', 'mecanico').send({ sourceSessionId: 30, startedAt: data.startedAt, endedAt: data.endedAt, note: data.note, activityStatus: 'en_proceso' })).status).toBe(400);
    expect(createWorkshopTimeRequest).not.toHaveBeenCalled();
  });
  it('reserves reasoned review for supervisors', async () => {
    expect(
      (
        await request(app)
          .patch('/api/workshop-time/requests/200/review')
          .set('x-test-role', 'mecanico')
          .send({ approve: true, note: 'Mi registro' })
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .patch('/api/workshop-time/requests/200/review')
          .set('x-test-role', 'jefe')
          .send({ approve: false, note: '' })
      ).status,
    ).toBe(400);
    expect(reviewWorkshopTimeRequest).not.toHaveBeenCalled();
    expect(
      (
        await request(app)
          .patch('/api/workshop-time/requests/200/review')
          .set('x-test-role', 'jefe')
          .send({ approve: false, note: 'No coincide con el parte' })
      ).status,
    ).toBe(200);
    expect(reviewWorkshopTimeRequest).toHaveBeenCalledWith({ id: 1, role: 'jefe' }, 200, {
      approve: false,
      note: 'No coincide con el parte',
    });
  });
});
