import { z } from 'zod';
import { paginationSchema } from './pagination.schema.js';
import { chilePatenteSchema } from './vehicle.schema.js';
import { FLEET_DOCUMENT_EXPIRY_FILTERS, FLEET_VEHICLE_STATUSES } from '../constants/fleet.js';
const currentYear = new Date().getFullYear();
const optionalString = (maxLength) => z
    .string()
    .trim()
    .max(maxLength)
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional();
const codigoInternoSchema = z
    .string()
    .trim()
    .max(30, 'El código interno no puede superar los 30 caracteres')
    .transform((value) => (value === '' ? null : value.toUpperCase()))
    .nullable()
    .optional();
const vinChasisSchema = z
    .string()
    .trim()
    .max(50)
    .transform((value) => {
    const normalized = value.toUpperCase();
    return normalized === '' ? null : normalized;
})
    .nullable()
    .optional();
export const createFleetVehicleSchema = z.object({
    patente: chilePatenteSchema,
    codigoInterno: codigoInternoSchema,
    marca: optionalString(80),
    modelo: optionalString(80),
    ano: z.coerce
        .number()
        .int()
        .min(1950, 'Año inválido')
        .max(currentYear + 1, 'Año futuro inválido')
        .nullable()
        .optional(),
    color: optionalString(40),
    vinChasis: vinChasisSchema,
    motor: optionalString(50),
    kilometraje: z.coerce.number().int().min(0).nullable().optional(),
    combustible: optionalString(30),
    transmision: optionalString(30),
    estadoOperativo: z.enum(FLEET_VEHICLE_STATUSES).optional(),
    sucursal: optionalString(120),
    responsable: optionalString(120),
});
export const updateFleetVehicleSchema = createFleetVehicleSchema.partial().refine((data) => Object.keys(data).length > 0, {
    message: 'Debe enviar al menos un campo para actualizar',
});
export const fleetVehicleQuerySchema = paginationSchema.extend({
    search: z.string().trim().optional(),
    estado: z.enum(FLEET_VEHICLE_STATUSES).optional(),
    vencimiento: z.enum(FLEET_DOCUMENT_EXPIRY_FILTERS).optional(),
});
