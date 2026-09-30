import 'reflect-metadata';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Application } from 'express';
import helmet from 'helmet';

import { sequelize } from './config/database.js';
import { env } from './config/env.js';
import { ensureDatabaseBootstrapped } from './database/bootstrap.js';
import { csrfProtection } from './middlewares/csrf-protection.js';
import { errorHandler } from './middlewares/error-handler.js';
import { notFoundHandler } from './middlewares/not-found.js';
import { requestIdMiddleware } from './middlewares/request-id.js';
import { apiRouter } from './routes/index.js';
import { logger } from './utils/logger.js';

import type { Logger } from 'pino';

export const app: Application = express();

// 1. Request ID (debe ser el primero para trazar toda la petición)
app.use(requestIdMiddleware);

// 2. Seguridad HTTP y CORS
// Helmet con CSP configurado para permitir Service Workers (requerido para la instalación PWA).
// El SW se sirve desde el mismo origen, pero necesita que la directiva `worker-src` lo permita.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'"],
        workerSrc: ["'self'", 'blob:'],
        manifestSrc: ["'self'"],
        mediaSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameSrc: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
  }),
);
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
     const requestPath = req.path;
     log.info(
       {
         requestId: res.locals.requestId,
         method: req.method,
         path: requestPath,
         statusCode: res.statusCode,
         duration: `${duration}ms`,
       },
       `${req.method} ${requestPath} ${res.statusCode} - ${duration}ms`,
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

  // 6a. Service Worker: sin caché + header de scope completo
  //     Chrome requiere Service-Worker-Allowed: / para que el SW cubra toda la app.
  //     Cache-Control: no-cache evita que el navegador use un SW obsoleto.
  app.get('/sw.js', (_req, res) => {
    res.set({
      'Content-Type': 'application/javascript; charset=utf-8',
      'Service-Worker-Allowed': '/',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'X-Content-Type-Options': 'nosniff',
    });
    res.sendFile(path.join(webDistPath, 'sw.js'));
  });

  // 6b. Workbox runtime (companion del SW generado por VitePWA)
  app.get('/workbox-*.js', (req, res) => {
    res.set({
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'public, max-age=31536000, immutable',
    });
    res.sendFile(path.join(webDistPath, req.path));
  });

  // 6c. Manifiesto PWA: sin caché + MIME type correcto
  //     Express 5 no registra por defecto .webmanifest; sin el MIME correcto
  //     Chrome no muestra el prompt de instalación.
  app.get('/manifest.webmanifest', (_req, res) => {
    res.set({
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    });
    res.sendFile(path.join(webDistPath, 'manifest.webmanifest'));
  });

  // 6d. Resto de assets estáticos (JS, CSS, imágenes, fuentes)
  app.use(
    express.static(webDistPath, {
      // Los assets de Vite llevan hash → cacheable 1 año
      setHeaders(res, filePath) {
        if (/\/assets\//.test(filePath)) {
          res.set('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    }),
  );

  // 6e. SPA fallback: todas las rutas desconocidas devuelven index.html
  app.get('/{*splat}', (_req, res) => {
    res.sendFile(path.join(webDistPath, 'index.html'));
  });
}

// 7. Manejo de 404 y errores globales
app.use(notFoundHandler);
app.use(errorHandler);

// Iniciar servidor y base de datos cuando no esté en modo test
if (env.NODE_ENV !== 'test') {
  try {
    fs.mkdirSync(path.resolve(env.UPLOAD_DIR), { recursive: true });
  } catch (err) {
    logger.warn({ err }, 'Aviso: No se pudo verificar la carpeta de uploads');
  }

  sequelize
    .authenticate()
    .then(async () => {
      logger.info('Conexión a base de datos MySQL establecida correctamente.');
      try {
        await sequelize.sync({ alter: true });
        logger.info('Modelos sincronizados con la base de datos (alter: true).');
      } catch (syncErr) {
        logger.warn({ syncErr }, 'Aviso: sync alter parcial, asegurando tablas base');
        await sequelize.sync({ alter: false });
      }
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
