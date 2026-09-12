import { z } from 'zod';

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1, 'La página debe ser mayor o igual a 1').default(1),
  pageSize: z.coerce
    .number()
    .int()
    .min(1, 'El tamaño de página debe ser al menos 1')
    .max(100, 'El tamaño de página no puede exceder 100')
    .default(20),
});
