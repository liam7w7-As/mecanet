import { getWorkOrderAlerts, getWorkshopAlerts, getWorkshopAlertSettings, updateWorkshopAlertSettings } from '../services/workshop-alert.service.js';
import { getWorkshopServiceHistory } from '../services/workshop-history.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

import type { UpdateWorkshopAlertSettingsInput, WorkshopHistoryQuery } from '@unithor/shared';

export const getWorkshopServiceHistoryHandler = asyncHandler(async (req, res) => {
  res.json({ history: await getWorkshopServiceHistory(Number(req.params.id), Number(req.params.itemId), req.query as unknown as WorkshopHistoryQuery, req.user!.id) });
});

export const getWorkOrderAlertsHandler = asyncHandler(async (req, res) => {
  res.json({ summary: await getWorkOrderAlerts(Number(req.params.id), req.user!.id) });
});
export const getWorkshopAlertsHandler = asyncHandler(async (req, res) => {
  res.json({ summary: await getWorkshopAlerts(req.query.fecha as string | undefined, req.user!.id) });
});
export const getWorkshopAlertSettingsHandler = asyncHandler(async (req, res) => {
  res.json({ settings: await getWorkshopAlertSettings(req.user!.id) });
});
export const updateWorkshopAlertSettingsHandler = asyncHandler(async (req, res) => {
  res.json({ settings: await updateWorkshopAlertSettings(req.body as UpdateWorkshopAlertSettingsInput, req.user!.id) });
});
