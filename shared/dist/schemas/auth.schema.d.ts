import { z } from 'zod';
export declare const loginSchema: z.ZodEffects<z.ZodObject<{
    identifier: z.ZodEffects<z.ZodString, string, string>;
    password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    identifier: string;
    password: string;
}, {
    identifier: string;
    password: string;
}>, {
    identifier: string;
    password: string;
}, unknown>;
export declare const registerSchema: z.ZodObject<{
    nombre: z.ZodString;
    email: z.ZodString;
    password: z.ZodString;
    roleId: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    password: string;
    email: string;
    nombre: string;
    roleId: number;
}, {
    password: string;
    email: string;
    nombre: string;
    roleId: number;
}>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
