import { z } from 'zod';
import { paginationSchema } from './pagination.schema.js';
const rutRegex = /^(?:\d{1,2}(?:\.?\d{3}){1,2}|\d{6,8})-?[\dkK]$/i;
const phoneRegex = /^[+\d\s().-]+$/;
const optionalString = (maxLength) => z
    .string()
    .trim()
    .max(maxLength)
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional();
const isValidRut = (value) => {
    if (!rutRegex.test(value)) {
        return false;
    }
    const normalized = value.replace(/[.-]/g, '').toUpperCase();
    const body = normalized.slice(0, -1);
    const verifier = normalized.slice(-1);
    let sum = 0;
    let weight = 2;
    for (let index = body.length - 1; index >= 0; index -= 1) {
        sum += Number(body[index]) * weight;
        weight = weight === 7 ? 2 : weight + 1;
    }
    const remainder = sum % 11;
    const expectedVerifier = remainder === 0 ? '0' : remainder === 1 ? 'K' : String(11 - remainder);
    return verifier === expectedVerifier;
};
export const rutSchema = z
    .string()
    .trim()
    .refine((value) => value === '' || isValidRut(value), {
    message: 'RUT chileno inválido o con dígito verificador incorrecto (ej: 12.345.678-5)',
})
    .transform((value) => {
    const normalized = value.replace(/[.-]/g, '').toUpperCase();
    return normalized === '' ? null : normalized;
})
    .nullable()
    .optional();
export const chilePhoneSchema = z
    .string()
    .trim()
    .max(30)
    .refine((value) => {
    if (value === '') {
        return true;
    }
    if (!phoneRegex.test(value)) {
        return false;
    }
    const digits = value.replace(/\D/g, '');
    const nationalNumber = digits.startsWith('56') ? digits.slice(2) : digits;
    return nationalNumber.length === 9 && ['2', '9'].includes(nationalNumber[0]);
}, {
    message: 'Teléfono chileno inválido (ej: +56 9 1234 5678 o 2 2345 6789)',
})
    .transform((value) => {
    if (value === '') {
        return null;
    }
    const digits = value.replace(/\D/g, '');
    const nationalNumber = digits.startsWith('56') ? digits.slice(2) : digits;
    return `+56${nationalNumber}`;
})
    .nullable()
    .optional();
const emailSchema = z
    .string()
    .trim()
    .toLowerCase()
    .max(180)
    .transform((value) => (value === '' ? null : value))
    .pipe(z.string().email('Email inválido').nullable())
    .nullable()
    .optional();
export const createClientSchema = z.object({
    rut: rutSchema,
    nombre: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres').max(180),
    tipo: z.enum(['cliente', 'empresa']),
    email: emailSchema,
    telefono: chilePhoneSchema,
    direccion: optionalString(255),
    region: optionalString(100),
    comuna: optionalString(100),
    notas: z
        .string()
        .trim()
        .transform((value) => (value === '' ? null : value))
        .nullable()
        .optional(),
});
export const updateClientSchema = createClientSchema.partial().refine((data) => Object.keys(data).length > 0, {
    message: 'Debe enviar al menos un campo para actualizar',
});
export const clientQuerySchema = paginationSchema.extend({
    search: z.string().trim().optional(),
    tipo: z.enum(['cliente', 'empresa']).optional(),
});
