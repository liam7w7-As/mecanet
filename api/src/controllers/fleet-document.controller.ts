import * as fleetDocumentService from '../services/fleet-document.service.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

import type {
  CreateFleetDocumentInput,
  FleetDocumentVersionInput,
  UpdateFleetDocumentInput,
} from '@unithor/shared';
import type { Request, Response } from 'express';

const getVehicleId = (req: Request): number => Number(req.params.id);
const getDocumentId = (req: Request): number => Number(req.params.documentId);

const getCurrentUserId = (req: Request): number => {
  if (!req.user) {
    throw ApiError.internal('Error de programación: usuario no autenticado');
  }
  return req.user.id;
};

const getVersionId = (req: Request): number | undefined => {
  const raw = req.query.versionId;
  if (typeof raw === 'number') return raw;
  return typeof raw === 'string' && raw !== '' ? Number(raw) : undefined;
};

const buildDisposition = (fileName: string, download: boolean): string => {
  const safeName = fileName
    .replace(/[^\x20-\x7e]/g, '_')
    .replace(/["\\]/g, '')
    .slice(0, 120);
  const type = download ? 'attachment' : 'inline';
  return `${type}; filename="${safeName || 'documento'}"; filename*=UTF-8''${encodeURIComponent(
    fileName,
  )}`;
};

export const getFleetDocumentsHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const documents = await fleetDocumentService.listFleetDocuments(getVehicleId(req));
    res.status(200).json({ documents });
  },
);

export const createFleetDocumentHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const document = await fleetDocumentService.createFleetDocument(
      getVehicleId(req),
      req.body as CreateFleetDocumentInput,
      req.file,
      getCurrentUserId(req),
    );
    res.status(201).json({ document });
  },
);

export const updateFleetDocumentHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const document = await fleetDocumentService.updateFleetDocument(
      getVehicleId(req),
      getDocumentId(req),
      req.body as UpdateFleetDocumentInput,
    );
    res.status(200).json({ document });
  },
);

export const deleteFleetDocumentHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    await fleetDocumentService.deleteFleetDocument(getVehicleId(req), getDocumentId(req));
    res.status(200).json({ message: 'Documento eliminado' });
  },
);

export const addFleetDocumentVersionHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    if (!req.file) {
      throw ApiError.badRequest('Debe adjuntar un archivo en el campo file');
    }

    const document = await fleetDocumentService.addFleetDocumentVersion(
      getVehicleId(req),
      getDocumentId(req),
      req.body as FleetDocumentVersionInput,
      req.file,
      getCurrentUserId(req),
    );
    res.status(201).json({ document });
  },
);

export const getFleetDocumentVersionsHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const result = await fleetDocumentService.getFleetDocumentVersions(
      getVehicleId(req),
      getDocumentId(req),
    );
    res.status(200).json(result);
  },
);

export const getFleetDocumentFileHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const file = await fleetDocumentService.readFleetDocumentFile(
      getVehicleId(req),
      getDocumentId(req),
      getVersionId(req),
    );

    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Length', String(file.bytes.length));
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader(
      'Content-Disposition',
      buildDisposition(file.fileName, req.query.download === '1'),
    );
    res.end(file.bytes);
  },
);
