import { createSpecialtySchema, updateSpecialtySchema, createSpecialtyRateSchema, updateWorkerSpecialtiesSchema, updateWorkshopScheduleSchema, createWorkshopScheduleExceptionSchema } from '@unithor/shared';
import { Router } from 'express';
import { z } from 'zod';

import { authenticate } from '../middlewares/authenticate.js';
import { authorizeRoles } from '../middlewares/authorize-roles.js';
import { authorize } from '../middlewares/authorize.js';
import { validate } from '../middlewares/validate.js';
import { hasPermission } from '../services/permission.service.js';
import * as personnel from '../services/workshop-personnel.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/** Mount at /api/workshop-personnel behind the application's global csrfProtection. */
export const workshopPersonnelRouter = Router();
workshopPersonnelRouter.use(authenticate, authorizeRoles('desarrollador', 'admin', 'jefe'), authorize('taller', 'read'));
/** The chief already owns shifts, so specialties, profiles and the weekly schedule use the taller module. */
const workshopManagement = [authorize('taller', 'update')];
const workshopCreation = [authorize('taller', 'create')];
/** Cost and sale prices are costing data and stay with administration. */
const pricingOnly = [authorizeRoles('desarrollador', 'admin'), authorize('admin', 'update')];
const specialtyParams = z.object({ specialtyId: z.coerce.number().int().positive() });
const workerParams = z.object({ userId: z.coerce.number().int().positive() });

workshopPersonnelRouter.get('/config', asyncHandler(async (req, res) => {
  const user = req.user!;
  // Rates stay private to the same roles allowed to create them.
  const includeRates = ['desarrollador', 'admin'].includes(user.role)
    && await hasPermission(user.id, 'admin', 'update');
  res.json(await personnel.getWorkshopPersonnelConfig({ includeRates }));
}));
workshopPersonnelRouter.post('/specialties', ...workshopCreation, validate({ body: createSpecialtySchema }), asyncHandler(async (req, res) => {
  res.status(201).json(await personnel.createSpecialty(req.body));
}));
workshopPersonnelRouter.post('/specialties/seed', ...workshopCreation, validate({ body: z.object({}).strict() }), asyncHandler(async (_req, res) => {
  res.status(201).json(await personnel.seedWorkshopSpecialties());
}));
workshopPersonnelRouter.patch('/specialties/:specialtyId', ...workshopManagement, validate({ params: specialtyParams, body: updateSpecialtySchema }), asyncHandler(async (req, res) => {
  res.json(await personnel.updateSpecialty(Number(req.params.specialtyId), req.body));
}));
workshopPersonnelRouter.post('/specialties/:specialtyId/rates', ...pricingOnly, validate({ params: specialtyParams, body: createSpecialtyRateSchema }), asyncHandler(async (req, res) => {
  res.status(201).json(await personnel.appendSpecialtyRate(Number(req.params.specialtyId), req.body, req.user!.id));
}));
workshopPersonnelRouter.put('/workers/:userId/profile', ...workshopManagement, validate({ params: workerParams, body: updateWorkerSpecialtiesSchema }), asyncHandler(async (req, res) => {
  res.json(await personnel.updateWorkerSpecialties(Number(req.params.userId), req.body, req.user!.id));
}));
workshopPersonnelRouter.put('/schedule', ...workshopManagement, validate({ body: updateWorkshopScheduleSchema }), asyncHandler(async (req, res) => {
  res.json(await personnel.updateWorkshopSchedule(req.body, req.user!.id));
}));
workshopPersonnelRouter.post('/workers/:userId/exceptions', authorize('taller', 'update'), validate({ params: workerParams, body: createWorkshopScheduleExceptionSchema }), asyncHandler(async (req, res) => {
  res.status(201).json(await personnel.appendWorkshopScheduleException(Number(req.params.userId), req.body, req.user!.id));
}));
