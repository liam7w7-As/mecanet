import { z } from 'zod';

export const updateWorkOrderPricePolicySchema = z.object({ approvalRequired: z.boolean() }).strict();
export type UpdateWorkOrderPricePolicyInput = z.infer<typeof updateWorkOrderPricePolicySchema>;
