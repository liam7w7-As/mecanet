import { loginSchema } from '@unithor/shared';
import { Router } from 'express';

import {
  loginController,
  logoutAllController,
  logoutController,
  meController,
  refreshController,
} from '../controllers/auth.controller.js';
import { authenticate } from '../middlewares/authenticate.js';
import { validate } from '../middlewares/validate.js';

export const authRouter = Router();

// Endpoints públicos / de sesión
authRouter.post('/login', validate({ body: loginSchema }), loginController);
authRouter.post('/refresh', refreshController);
authRouter.post('/logout', logoutController);

// Endpoints protegidos (requieren usuario autenticado)
authRouter.post('/logout-all', authenticate, logoutAllController);
authRouter.get('/me', authenticate, meController);
