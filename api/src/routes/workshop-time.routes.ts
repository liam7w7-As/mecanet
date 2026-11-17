import {
  createWorkshopTimeRequestSchema,
  reviewWorkshopTimeRequestSchema,
  workshopTimeEligibleQuerySchema,
  workshopTimeQuerySchema,
  workshopTimeRequestParamsSchema,
} from '@unithor/shared';
import { Router } from 'express';

import { authenticate } from '../middlewares/authenticate.js';
import { authorizeRoles } from '../middlewares/authorize-roles.js';
import { authorize } from '../middlewares/authorize.js';
import { validate } from '../middlewares/validate.js';
import {
  createWorkshopTimeRequest,
  getWorkshopTimeEligibleItems,
  getWorkshopTimeJournal,
  reviewWorkshopTimeRequest,
} from '../services/workshop-time.service.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

import type { WorkshopTimeActor } from '../services/workshop-time.service.js';
import type { Request } from 'express';

export const workshopTimeRouter = Router();
const actor = (req: Request): WorkshopTimeActor => {
  if (!req.user) throw ApiError.unauthorized();
  return { id: req.user.id, role: req.user.role };
};

// CSRF is enforced by the global middleware, using the existing web API client.
workshopTimeRouter.use(authenticate, authorizeRoles('admin', 'desarrollador', 'jefe', 'mecanico'));
workshopTimeRouter.get(
  '/',
  authorize('taller', 'read'),
  validate({ query: workshopTimeQuerySchema }),
  asyncHandler(async (req, res) => {
    const query = workshopTimeQuerySchema.parse(req.query);
    res.json(await getWorkshopTimeJournal(actor(req), query));
  }),
);
workshopTimeRouter.get(
  '/eligible-items',
  authorize('taller', 'read'),
  validate({ query: workshopTimeEligibleQuerySchema }),
  asyncHandler(async (req, res) => {
    const query = workshopTimeEligibleQuerySchema.parse(req.query);
    res.json({ items: await getWorkshopTimeEligibleItems(actor(req), query.userId, query.fecha) });
  }),
);
workshopTimeRouter.post(
  '/requests',
  authorize('taller', 'update'),
  validate({ body: createWorkshopTimeRequestSchema }),
  asyncHandler(async (req, res) => {
    res
      .status(201)
      .json({
        request: await createWorkshopTimeRequest(
          actor(req),
          createWorkshopTimeRequestSchema.parse(req.body),
        ),
      });
  }),
);
workshopTimeRouter.patch(
  '/requests/:id/review',
  authorize('taller', 'update'),
  authorizeRoles('admin', 'desarrollador', 'jefe'),
  validate({ params: workshopTimeRequestParamsSchema, body: reviewWorkshopTimeRequestSchema }),
  asyncHandler(async (req, res) => {
    res.json({
      request: await reviewWorkshopTimeRequest(
        actor(req),
        Number(req.params.id),
        reviewWorkshopTimeRequestSchema.parse(req.body),
      ),
    });
  }),
);
