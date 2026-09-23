import 'reflect-metadata';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Application } from 'express';
import helmet from 'helmet';

import { sequelize } from './config/database.js';
import { env } from './config/env.js';
import { csrfProtection } from './middlewares/csrf-protection.js';
import { errorHandler } from './middlewares/error-handler.js';
import { notFoundHandler } from './middlewares/not-found.js';
import { requestIdMiddleware } from './middlewares/request-id.js';
import { ensureDatabaseBootstrapped } from './database/bootstrap.js';
import { apiRouter } from './routes/index.js';
import { logger } from './utils/logger.js';

import type { Logger } from 'pino';

export const app: Application = express();

// 1. Request ID (debe ser el primero para trazar toda la petición)
app.use(requestIdMiddleware);

// 2. Seguridad HTTP y CORS
app.use(helmet());
app.use(
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true,
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Request-Id',
      'X-CSRF-Token',
    ],
  }),
);

// 3. Parsers de petición
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 4. Protección CSRF (Double-Submit Cookie)
app.use(csrfProtection);

// 4. Logger de peticiones HTTP
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const log = (res.locals.logger as Logger) ?? logger;
    log.info(
      {
        method: req.method,
        url: req.originalUrl,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
      },
      `${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`,
    );
  });
  next();
});

// 5. Montar rutas API
app.use('/api', apiRouter);

// 6. Servir frontend React en producción
if (env.NODE_ENV === 'production') {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const webDistPath = path.join(__dirname, '../../web/dist');

  app.use(express.static(webDistPath));
  app.get('/{*splat}', (_req, res) => {
    res.sendFile(path.join(webDistPath, 'index.html'));
  });
}

// 7. Manejo de 404 y errores globales
app.use(notFoundHandler);
app.use(errorHandler);

// Iniciar servidor y base de datos cuando no esté en modo test
if (env.NODE_ENV !== 'test') {
  sequelize
    .authenticate()
    .then(async () => {
      logger.info('Conexión a base de datos MySQL establecida correctamente.');
      await sequelize.sync({ alter: false });
      logger.info('Modelos sincronizados con la base de datos (alter: false).');
      await ensureDatabaseBootstrapped();
    })
    .catch((err: unknown) => {
      logger.warn(
        { err },
        'Aviso: No se pudo conectar a la base de datos MySQL (el servidor iniciará en modo desacoplado)',
      );
    });

  app.listen(env.PORT, () => {
    logger.info(`Servidor API UNITHOR escuchando en http://localhost:${env.PORT}`);
  });
}

export default app;
