import { Router } from 'express';

import { healthRouter } from './health.js';

export const apiRouter = Router();

// Health check endpoint (/api/health)
apiRouter.use(healthRouter);

// Futuras rutas de módulos (Fases posteriores)
// apiRouter.use('/auth', authRouter);
// apiRouter.use('/users', usersRouter);
// apiRouter.use('/work-orders', workOrdersRouter);
// apiRouter.use('/quotations', quotationsRouter);
// apiRouter.use('/clients', clientsRouter);
// apiRouter.use('/vehicles', vehiclesRouter);
// apiRouter.use('/catalogs', catalogsRouter);
