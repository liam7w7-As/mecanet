import { z } from 'zod';

export * from './pagination.schema.js';
export * from './client.schema.js';
export * from './vehicle.schema.js';
export * from './catalog-item.schema.js';
export * from './work-order.schema.js';
export * from './quotation.schema.js';
export * from './payment.schema.js';

export const loginSchema = z.object({
  email: z.string().trim().email('Email inválido'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
});
