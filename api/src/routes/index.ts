import { Router } from 'express';

import { authRouter } from './auth.routes.js';
import { catalogRouter } from './catalog.routes.js';
import { clientRouter } from './client.routes.js';
import { dashboardRouter } from './dashboard.routes.js';
import { financeRouter } from './finance.routes.js';
import { healthRouter } from './health.js';
import { paymentRouter } from './payment.routes.js';
import { permissionRouter } from './permission.routes.js';
import { quotationRouter } from './quotation.routes.js';
import { reportRouter } from './report.routes.js';
import { searchRouter } from './search.routes.js';
import { userRouter } from './user.routes.js';
import { vehicleRouter } from './vehicle.routes.js';
import { warehouseRouter } from './warehouse.routes.js';
import { workOrderRouter } from './work-order.routes.js';

export const apiRouter = Router();

// Health check endpoint (/api/health)
apiRouter.use(healthRouter);

// Módulo de autenticación (/api/auth)
apiRouter.use('/auth', authRouter);

// Resumen analítico del panel principal (/api/dashboard)
apiRouter.use('/dashboard', dashboardRouter);

// Panel de Finanzas y Contabilidad (/api/finance)
apiRouter.use('/finance', financeRouter);

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

// Catálogo unificado de taller (/api/catalog)
apiRouter.use('/catalog', catalogRouter);

// Almacenes y movimientos de stock (/api/warehouses)
apiRouter.use('/warehouses', warehouseRouter);
