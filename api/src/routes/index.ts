import { Router } from 'express';

import { authRouter } from './auth.routes.js';
import { clientRouter } from './client.routes.js';
import { healthRouter } from './health.js';
import { permissionRouter } from './permission.routes.js';
import { userRouter } from './user.routes.js';

export const apiRouter = Router();

// Health check endpoint (/api/health)
apiRouter.use(healthRouter);

// Módulo de autenticación (/api/auth)
apiRouter.use('/auth', authRouter);

// Módulo de usuarios (/api/users)
apiRouter.use('/users', userRouter);

// Módulo de roles y permisos (/api/roles, /api/permissions)
apiRouter.use(permissionRouter);

// Módulo de clientes (/api/clients)
apiRouter.use('/clients', clientRouter);

// Futuras rutas de módulos (Fases posteriores)
// apiRouter.use('/work-orders', workOrdersRouter);
// apiRouter.use('/quotations', quotationsRouter);
// apiRouter.use('/vehicles', vehiclesRouter);
// apiRouter.use('/catalogs', catalogsRouter);
