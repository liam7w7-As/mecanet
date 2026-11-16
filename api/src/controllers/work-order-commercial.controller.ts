import { getWorkOrderPricePolicy, updateWorkOrderPricePolicy } from '../services/work-order-price-policy.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const getWorkOrderPricePolicyHandler = asyncHandler(async (req, res) => {
  res.json({ policy: await getWorkOrderPricePolicy(Number(req.params.id), req.user!.id) });
});
export const updateWorkOrderPricePolicyHandler = asyncHandler(async (req, res) => {
  res.json({ policy: await updateWorkOrderPricePolicy(Number(req.params.id), (req.body as { approvalRequired: boolean }).approvalRequired, req.user!.id) });
});
