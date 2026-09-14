import { Router } from 'express';

import { authRouter } from './auth.routes.js';
import { healthRouter } from './health.js';

export const apiRouter = Router();

// Health check endpoint (/api/health)
apiRouter.use(healthRouter);

// Módulo de autenticación (/api/auth)
apiRouter.use('/auth', authRouter);

// Futuras rutas de módulos (Fases posteriores)
// apiRouter.use('/users', usersRouter);
// apiRouter.use('/work-orders', workOrdersRouter);
// apiRouter.use('/quotations', quotationsRouter);
// apiRouter.use('/clients', clientsRouter);
// apiRouter.use('/vehicles', vehiclesRouter);
// apiRouter.use('/catalogs', catalogsRouter);
