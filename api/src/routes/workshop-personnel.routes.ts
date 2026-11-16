import { createSpecialtySchema, updateSpecialtySchema, createSpecialtyRateSchema, updateWorkerSpecialtiesSchema, updateWorkshopScheduleSchema, createWorkshopScheduleExceptionSchema } from '@unithor/shared';
import { Router } from 'express';
import { z } from 'zod';

import { authenticate } from '../middlewares/authenticate.js';
import { authorizeRoles } from '../middlewares/authorize-roles.js';
import { authorize } from '../middlewares/authorize.js';
import { validate } from '../middlewares/validate.js';
import * as personnel from '../services/workshop-personnel.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/** Mount at /api/workshop-personnel behind the application's global csrfProtection. */
export const workshopPersonnelRouter = Router();
workshopPersonnelRouter.use(authenticate, authorizeRoles('desarrollador', 'admin', 'jefe'), authorize('taller', 'read'));
const administrationOnly = [authorizeRoles('desarrollador', 'admin'), authorize('admin', 'update')];
const specialtyParams = z.object({ specialtyId: z.coerce.number().int().positive() });
const workerParams = z.object({ userId: z.coerce.number().int().positive() });

workshopPersonnelRouter.get('/config', asyncHandler(async (_req, res) => {
  res.json(await personnel.getWorkshopPersonnelConfig());
}));
workshopPersonnelRouter.post('/specialties', ...administrationOnly, validate({ body: createSpecialtySchema }), asyncHandler(async (req, res) => {
  res.status(201).json(await personnel.createSpecialty(req.body));
}));
workshopPersonnelRouter.post('/specialties/seed', ...administrationOnly, validate({ body: z.object({}).strict() }), asyncHandler(async (_req, res) => {
  res.status(201).json(await personnel.seedWorkshopSpecialties());
}));
workshopPersonnelRouter.patch('/specialties/:specialtyId', ...administrationOnly, validate({ params: specialtyParams, body: updateSpecialtySchema }), asyncHandler(async (req, res) => {
  res.json(await personnel.updateSpecialty(Number(req.params.specialtyId), req.body));
}));
workshopPersonnelRouter.post('/specialties/:specialtyId/rates', ...administrationOnly, validate({ params: specialtyParams, body: createSpecialtyRateSchema }), asyncHandler(async (req, res) => {
  res.status(201).json(await personnel.appendSpecialtyRate(Number(req.params.specialtyId), req.body, req.user!.id));
}));
workshopPersonnelRouter.put('/workers/:userId/profile', ...administrationOnly, validate({ params: workerParams, body: updateWorkerSpecialtiesSchema }), asyncHandler(async (req, res) => {
  res.json(await personnel.updateWorkerSpecialties(Number(req.params.userId), req.body, req.user!.id));
}));
workshopPersonnelRouter.put('/schedule', ...administrationOnly, validate({ body: updateWorkshopScheduleSchema }), asyncHandler(async (req, res) => {
  res.json(await personnel.updateWorkshopSchedule(req.body, req.user!.id));
}));
workshopPersonnelRouter.post('/workers/:userId/exceptions', authorize('taller', 'update'), validate({ params: workerParams, body: createWorkshopScheduleExceptionSchema }), asyncHandler(async (req, res) => {
  res.status(201).json(await personnel.appendWorkshopScheduleException(Number(req.params.userId), req.body, req.user!.id));
}));
