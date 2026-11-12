import { z } from 'zod';
import { isValidChilePatente, normalizeChilePatente } from './vehicle.schema.js';
const normalizePatente = (value) => isValidChilePatente(value) ? normalizeChilePatente(value) : value.trim().toUpperCase();
export const quickSearchQuerySchema = z.object({
    q: z.string().trim().min(2, 'El término de búsqueda debe tener al menos 2 caracteres').max(50),
    limit: z.coerce.number().int().min(1).max(20).default(10),
});
export const lookupByPlateSchema = z.object({
    patente: z
        .string()
        .trim()
        .min(4, 'La patente debe tener al menos 4 caracteres')
        .max(15)
        .transform(normalizePatente),
});
