import { env } from '../config/env.js';
import { verifyCustomerEmailTransport } from '../services/customer-email-worker.service.js';

try {
  await verifyCustomerEmailTransport();
  console.log('SMTP: conexión TLS y autenticación correctas. No se ha enviado ningún correo.');
} catch {
  console.error(
    env.MAIL_ENABLED
      ? 'SMTP: no se pudo autenticar o conectar. Revise host, puerto, usuario y contraseña de aplicación.'
      : 'SMTP: configure MAIL_ENABLED=true y las credenciales para comprobar la conexión.',
  );
  process.exitCode = 1;
}
