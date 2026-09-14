import { Router } from 'express';

import { authRouter } from './auth.routes.js';
import { clientRouter } from './client.routes.js';
import { healthRouter } from './health.js';
import { paymentRouter } from './payment.routes.js';
import { permissionRouter } from './permission.routes.js';
import { quotationRouter } from './quotation.routes.js';
import { reportRouter } from './report.routes.js';
import { searchRouter } from './search.routes.js';
import { userRouter } from './user.routes.js';
import { vehicleRouter } from './vehicle.routes.js';
import { workOrderRouter } from './work-order.routes.js';

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

// Módulo de vehículos (/api/vehicles)
apiRouter.use('/vehicles', vehicleRouter);

// Búsqueda rápida (/api/search)
apiRouter.use('/search', searchRouter);

// Órdenes de trabajo (/api/work-orders)
apiRouter.use('/work-orders', workOrderRouter);

// Cotizaciones (/api/quotations)
apiRouter.use('/quotations', quotationRouter);

// Pagos (/api/payments)
apiRouter.use('/payments', paymentRouter);

// Reportes comerciales (/api/reports)
apiRouter.use('/reports', reportRouter);

// Futuras rutas de módulos (Fases posteriores)
// apiRouter.use('/catalogs', catalogsRouter);
