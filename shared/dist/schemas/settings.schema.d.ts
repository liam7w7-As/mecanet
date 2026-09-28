import { z } from 'zod';
export declare const companySettingsFields: {
    razonSocial: z.ZodString;
    nombreComercial: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>;
    rut: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string | null, string>>>;
    giro: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>;
    direccion: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>;
    region: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>;
    comuna: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>;
    telefono: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string | null, string>>>;
    email: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>, string | null | undefined, string | null | undefined>;
    sitioWeb: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>, string | null | undefined, string | null | undefined>;
};
export declare const companySettingsSchema: z.ZodObject<{
    razonSocial: z.ZodString;
    nombreComercial: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>;
    rut: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string | null, string>>>;
    giro: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>;
    direccion: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>;
    region: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>;
    comuna: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>;
    telefono: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string | null, string>>>;
    email: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>, string | null | undefined, string | null | undefined>;
    sitioWeb: z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>, string | null | undefined, string | null | undefined>;
}, "strip", z.ZodTypeAny, {
    razonSocial: string;
    email?: string | null | undefined;
    rut?: string | null | undefined;
    telefono?: string | null | undefined;
    direccion?: string | null | undefined;
    region?: string | null | undefined;
    comuna?: string | null | undefined;
    nombreComercial?: string | null | undefined;
    giro?: string | null | undefined;
    sitioWeb?: string | null | undefined;
}, {
    razonSocial: string;
    email?: string | null | undefined;
    rut?: string | null | undefined;
    telefono?: string | null | undefined;
    direccion?: string | null | undefined;
    region?: string | null | undefined;
    comuna?: string | null | undefined;
    nombreComercial?: string | null | undefined;
    giro?: string | null | undefined;
    sitioWeb?: string | null | undefined;
}>;
export declare const updateCompanySettingsSchema: z.ZodEffects<z.ZodObject<{
    razonSocial: z.ZodOptional<z.ZodString>;
    nombreComercial: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>>;
    rut: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string | null, string>>>>;
    giro: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>>;
    direccion: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>>;
    region: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>>;
    comuna: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>>;
    telefono: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string | null, string>>>>;
    email: z.ZodOptional<z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>, string | null | undefined, string | null | undefined>>;
    sitioWeb: z.ZodOptional<z.ZodEffects<z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string | null, string>>>, string | null | undefined, string | null | undefined>>;
}, "strip", z.ZodTypeAny, {
    email?: string | null | undefined;
    rut?: string | null | undefined;
    telefono?: string | null | undefined;
    direccion?: string | null | undefined;
    region?: string | null | undefined;
    comuna?: string | null | undefined;
    razonSocial?: string | undefined;
    nombreComercial?: string | null | undefined;
    giro?: string | null | undefined;
    sitioWeb?: string | null | undefined;
}, {
    email?: string | null | undefined;
    rut?: string | null | undefined;
    telefono?: string | null | undefined;
    direccion?: string | null | undefined;
    region?: string | null | undefined;
    comuna?: string | null | undefined;
    razonSocial?: string | undefined;
    nombreComercial?: string | null | undefined;
    giro?: string | null | undefined;
    sitioWeb?: string | null | undefined;
}>, {
    email?: string | null | undefined;
    rut?: string | null | undefined;
    telefono?: string | null | undefined;
    direccion?: string | null | undefined;
    region?: string | null | undefined;
    comuna?: string | null | undefined;
    razonSocial?: string | undefined;
    nombreComercial?: string | null | undefined;
    giro?: string | null | undefined;
    sitioWeb?: string | null | undefined;
}, {
    email?: string | null | undefined;
    rut?: string | null | undefined;
    telefono?: string | null | undefined;
    direccion?: string | null | undefined;
    region?: string | null | undefined;
    comuna?: string | null | undefined;
    razonSocial?: string | undefined;
    nombreComercial?: string | null | undefined;
    giro?: string | null | undefined;
    sitioWeb?: string | null | undefined;
}>;
/** Subtipo de branding expuesto sin sesión: solo lo que ya va impreso en el PDF. */
export declare const publicBrandingSchema: z.ZodObject<{
    razonSocial: z.ZodString;
    nombreComercial: z.ZodNullable<z.ZodString>;
    rut: z.ZodNullable<z.ZodString>;
    direccion: z.ZodNullable<z.ZodString>;
    region: z.ZodNullable<z.ZodString>;
    comuna: z.ZodNullable<z.ZodString>;
    telefono: z.ZodNullable<z.ZodString>;
    email: z.ZodNullable<z.ZodString>;
    sitioWeb: z.ZodNullable<z.ZodString>;
    /** true cuando hay un logo propio subido; el cliente lo pide a /settings/company/logo. */
    tieneLogo: z.ZodBoolean;
    logoUrl: z.ZodNullable<z.ZodString>;
    /** Sirve de cache-buster para el <img src> del logo. */
    logoUpdatedAt: z.ZodNullable<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    email: string | null;
    rut: string | null;
    telefono: string | null;
    direccion: string | null;
    region: string | null;
    comuna: string | null;
    razonSocial: string;
    nombreComercial: string | null;
    sitioWeb: string | null;
    tieneLogo: boolean;
    logoUrl: string | null;
    logoUpdatedAt: string | null;
}, {
    email: string | null;
    rut: string | null;
    telefono: string | null;
    direccion: string | null;
    region: string | null;
    comuna: string | null;
    razonSocial: string;
    nombreComercial: string | null;
    sitioWeb: string | null;
    tieneLogo: boolean;
    logoUrl: string | null;
    logoUpdatedAt: string | null;
}>;
export declare const companyLogoPublicSchema: z.ZodObject<{
    tieneLogo: z.ZodBoolean;
    logoUrl: z.ZodNullable<z.ZodString>;
    mimeType: z.ZodNullable<z.ZodString>;
    sizeBytes: z.ZodNullable<z.ZodNumber>;
    updatedAt: z.ZodNullable<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    updatedAt: string | null;
    tieneLogo: boolean;
    logoUrl: string | null;
    mimeType: string | null;
    sizeBytes: number | null;
}, {
    updatedAt: string | null;
    tieneLogo: boolean;
    logoUrl: string | null;
    mimeType: string | null;
    sizeBytes: number | null;
}>;
export type CompanySettings = z.infer<typeof companySettingsSchema>;
export type UpdateCompanySettingsInput = z.infer<typeof updateCompanySettingsSchema>;
export type PublicBranding = z.infer<typeof publicBrandingSchema>;
export type CompanyLogoPublic = z.infer<typeof companyLogoPublicSchema>;
