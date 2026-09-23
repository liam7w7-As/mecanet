import { z } from 'zod';
const loginCredentialsSchema = z.object({
    identifier: z
        .string()
        .trim()
        .min(3, 'Ingrese un usuario o correo válido')
        .max(180, 'El usuario o correo no puede exceder 180 caracteres')
        .transform((value) => value.toLowerCase()),
    password: z
        .string()
        .min(8, 'La contraseña debe tener al menos 8 caracteres')
        .max(100, 'La contraseña no puede exceder 100 caracteres'),
});
export const loginSchema = z.preprocess((input) => {
    if (typeof input !== 'object' || input === null || !('email' in input) || 'identifier' in input) {
        return input;
    }
    const legacyInput = input;
    const emailResult = z.string().email().safeParse(legacyInput.email);
    return {
        identifier: emailResult.success ? emailResult.data : '',
        password: legacyInput.password,
    };
}, loginCredentialsSchema);
export const registerSchema = z.object({
    nombre: z
        .string()
        .min(2, 'El nombre debe tener al menos 2 caracteres')
        .max(120)
        .trim(),
    email: z.string().email('Email inválido').toLowerCase().trim(),
    password: z
        .string()
        .min(8, 'La contraseña debe tener al menos 8 caracteres')
        .max(100, 'La contraseña no puede exceder 100 caracteres'),
    roleId: z.coerce.number().int().positive('ID de rol inválido'),
});
