import { z } from 'zod';
import { paginationSchema } from './pagination.schema.js';
import { formatChilePatente, isValidChilePatente } from './vehicle.schema.js';
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
const baseFleetVehicleSchema = z.object({
    patente: z
        .string()
        .trim()
        .min(1, 'La patente es requerida')
        .max(15, 'La patente no puede tener más de 15 caracteres'),
    esExtranjera: z.boolean().optional(),
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
    propietario: optionalString(180),
    motivoBaja: optionalString(500),
});
export const createFleetVehicleSchema = baseFleetVehicleSchema
    .superRefine((data, ctx) => {
    const trimmed = data.patente.trim().toUpperCase();
    if (data.esExtranjera) {
        if (trimmed.length === 0) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['patente'],
                message: 'La patente es requerida',
            });
        }
    }
    else {
        if (!isValidChilePatente(trimmed)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ['patente'],
                message: 'Patente chilena inválida (ej: AB1234 o ABCD12). Si es de otro país, marque patente extranjera.',
            });
        }
    }
})
    .transform((data) => ({
    ...data,
    patente: data.esExtranjera
        ? data.patente.trim().toUpperCase()
        : formatChilePatente(data.patente),
}));
export const updateFleetVehicleSchema = baseFleetVehicleSchema
    .partial()
    .superRefine((data, ctx) => {
    if (data.patente !== undefined) {
        const trimmed = data.patente.trim().toUpperCase();
        if (data.esExtranjera) {
            if (trimmed.length === 0) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['patente'],
                    message: 'La patente es requerida',
                });
            }
        }
        else {
            if (!isValidChilePatente(trimmed)) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    path: ['patente'],
                    message: 'Patente chilena inválida (ej: AB1234 o ABCD12). Si es de otro país, marque patente extranjera.',
                });
            }
        }
    }
})
    .transform((data) => ({
    ...data,
    ...(data.patente !== undefined
        ? {
            patente: data.esExtranjera
                ? data.patente.trim().toUpperCase()
                : formatChilePatente(data.patente),
        }
        : {}),
}))
    .refine((data) => Object.keys(data).length > 0, {
    message: 'Debe enviar al menos un campo para actualizar',
});
export const fleetVehicleQuerySchema = paginationSchema.extend({
    search: z.string().trim().optional(),
    estado: z.enum(FLEET_VEHICLE_STATUSES).optional(),
    vencimiento: z.enum(FLEET_DOCUMENT_EXPIRY_FILTERS).optional(),
});
