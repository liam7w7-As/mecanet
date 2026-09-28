import { updateCompanySettingsSchema } from '@unithor/shared';
import { Router } from 'express';

import {
  deleteCompanyLogoHandler,
  getCompanyLogoHandler,
  getCompanySettingsHandler,
  getPublicBrandingHandler,
  updateCompanySettingsHandler,
  uploadCompanyLogoHandler,
} from '../controllers/settings.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { authorize } from '../middlewares/authorize.js';
import { companyLogoUpload } from '../middlewares/company-logo-upload.js';
import { validate } from '../middlewares/validate.js';

export const settingsRouter = Router();

// --- Endpoints públicos: el login se pinta sin sesión -------------------
settingsRouter.get('/branding', getPublicBrandingHandler);
settingsRouter.get('/company/logo', getCompanyLogoHandler);

// --- Configuración: solo lectura con admin:read -------------------------
settingsRouter.get('/company', authenticate, authorize('admin', 'read'), getCompanySettingsHandler);

// --- Edición: admin:update (admin y desarrollador) ----------------------
settingsRouter.patch(
  '/company',
  authenticate,
  authorize('admin', 'update'),
  validate({ body: updateCompanySettingsSchema }),
  updateCompanySettingsHandler,
);

settingsRouter.post(
  '/company/logo',
  authenticate,
  authorize('admin', 'update'),
  companyLogoUpload,
  uploadCompanyLogoHandler,
);

settingsRouter.delete(
  '/company/logo',
  authenticate,
  authorize('admin', 'update'),
  deleteCompanyLogoHandler,
);
