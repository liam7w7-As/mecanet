import { z } from 'zod';
/** Signer identity always comes from the authenticated session. */
export declare const updateAccCustodySchema: z.ZodEffects<z.ZodEffects<z.ZodObject<{
    entregado: z.ZodOptional<z.ZodBoolean>;
    recibido: z.ZodOptional<z.ZodBoolean>;
    warehouseId: z.ZodOptional<z.ZodNumber>;
    notaEntrega: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strict", z.ZodTypeAny, {
    warehouseId?: number | undefined;
    entregado?: boolean | undefined;
    recibido?: boolean | undefined;
    notaEntrega?: string | null | undefined;
}, {
    warehouseId?: number | undefined;
    entregado?: boolean | undefined;
    recibido?: boolean | undefined;
    notaEntrega?: string | null | undefined;
}>, {
    warehouseId?: number | undefined;
    entregado?: boolean | undefined;
    recibido?: boolean | undefined;
    notaEntrega?: string | null | undefined;
}, {
    warehouseId?: number | undefined;
    entregado?: boolean | undefined;
    recibido?: boolean | undefined;
    notaEntrega?: string | null | undefined;
}>, {
    warehouseId?: number | undefined;
    entregado?: boolean | undefined;
    recibido?: boolean | undefined;
    notaEntrega?: string | null | undefined;
}, {
    warehouseId?: number | undefined;
    entregado?: boolean | undefined;
    recibido?: boolean | undefined;
    notaEntrega?: string | null | undefined;
}>;
export type UpdateAccCustodyInput = z.infer<typeof updateAccCustodySchema>;
export declare const updateAccBodegueroDeliverySchema: z.ZodObject<{
    bodegueroUserId: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    entregado: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    entregado: boolean;
    bodegueroUserId?: number | null | undefined;
}, {
    entregado: boolean;
    bodegueroUserId?: number | null | undefined;
}>;
export declare const updateAccArmadorReceptionSchema: z.ZodObject<{
    armadorUserId: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    recibido: z.ZodBoolean;
    notaEntrega: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    recibido: boolean;
    notaEntrega?: string | null | undefined;
    armadorUserId?: number | null | undefined;
}, {
    recibido: boolean;
    notaEntrega?: string | null | undefined;
    armadorUserId?: number | null | undefined;
}>;
export type UpdateAccBodegueroDeliveryInput = z.infer<typeof updateAccBodegueroDeliverySchema>;
export type UpdateAccArmadorReceptionInput = z.infer<typeof updateAccArmadorReceptionSchema>;
