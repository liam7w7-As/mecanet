import { z } from 'zod';
export const updateWorkOrderPricePolicySchema = z.object({ approvalRequired: z.boolean() }).strict();
