import * as settingsService from '../services/settings.service.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

import type { UpdateCompanySettingsInput } from '@unithor/shared';
import type { Request, Response } from 'express';

const getCurrentUserId = (req: Request): number => {
  if (!req.user) {
    throw ApiError.internal('Error de programación: controlador requiere authenticate previo');
  }

  return req.user.id;
};

/** Público: el login lo necesita antes de que exista sesión. */
export const getPublicBrandingHandler = asyncHandler(
  async (_req: Request, res: Response): Promise<void> => {
    const branding = await settingsService.getPublicBranding();
    res.status(200).json(branding);
  },
);

/**
 * Público: el <img src> del logo lo consume el navegador directamente, y un
 * <img> no puede mandar el header CSRF ni leer un Authorization. Solo se
 * expone la imagen de marca, ningún dato operativo.
 */
export const getCompanyLogoHandler = asyncHandler(
  async (_req: Request, res: Response): Promise<void> => {
    const { bytes, mimeType } = await settingsService.readCompanyLogo();
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Length', String(bytes.length));
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    res.end(bytes);
  },
);

export const getCompanySettingsHandler = asyncHandler(
  async (_req: Request, res: Response): Promise<void> => {
    const settings = await settingsService.getCompanySettings();
    res.status(200).json(settings);
  },
);

export const updateCompanySettingsHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const settings = await settingsService.updateCompanySettings(
      req.body as UpdateCompanySettingsInput,
      getCurrentUserId(req),
    );
    res.status(200).json(settings);
  },
);

export const uploadCompanyLogoHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    if (!req.file) {
      throw ApiError.badRequest('No se recibió ningún archivo de logo');
    }
    const settings = await settingsService.saveCompanyLogo(req.file, getCurrentUserId(req));
    res.status(200).json(settings);
  },
);

export const deleteCompanyLogoHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const settings = await settingsService.deleteCompanyLogo(getCurrentUserId(req));
    res.status(200).json(settings);
  },
);
