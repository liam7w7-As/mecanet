import 'reflect-metadata';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Application } from 'express';
import helmet from 'helmet';

import { sequelize } from './config/database.js';
import { env } from './config/env.js';
import { errorHandler } from './middlewares/error-handler.js';
import { notFoundHandler } from './middlewares/not-found.js';
import { healthRouter } from './routes/health.js';
import { logger } from './utils/logger.js';

export const app: Application = express();

app.use(helmet());
app.use(
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true,
  }),
);
app.use(cookieParser());
app.use(express.json());

// Montar rutas
app.use('/api', healthRouter);

// Manejo de 404 y errores globales
app.use(notFoundHandler);
app.use(errorHandler);

// Iniciar servidor y base de datos cuando no esté en modo test
if (env.NODE_ENV !== 'test') {
  sequelize
    .authenticate()
    .then(async () => {
      logger.info('Conexión a base de datos MySQL establecida correctamente.');
      if (env.NODE_ENV === 'development') {
        await sequelize.sync({ alter: false });
        logger.info('Modelos sincronizados con la base de datos (alter: false).');
      }
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
