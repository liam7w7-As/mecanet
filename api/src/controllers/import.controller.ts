import { importCatalog } from '../services/import/catalog-import.service.js';
import {
  canAccessFleetOwner,
  importFleetVehicles,
} from '../services/import/fleet-import.service.js';
import {
  buildImportTemplate,
  importTemplateFileName,
} from '../services/import/import-template.service.js';
import { importVehicles } from '../services/import/vehicle-import.service.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

import type { ImportActor } from '../services/import/import-plan.service.js';
import type { ImportModule, ImportRequestQuery, ImportResult } from '@unithor/shared';
import type { Request, Response } from 'express';

type ImportRunner = (
  buffer: Buffer,
  fileName: string,
  dryRun: boolean,
  actor: ImportActor,
) => Promise<ImportResult>;

const IMPORTERS: Record<ImportModule, ImportRunner> = {
  catalog: importCatalog,
  vehicles: importVehicles,
  'fleet-vehicles': importFleetVehicles,
};

const EXCEL_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Entrega la plantilla `.xlsx` del módulo. El navegador la descarga y el
 * usuario la completa sin tener que adivinar los encabezados.
 */
export const downloadImportTemplateHandler = (module: ImportModule) =>
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const buffer = await buildImportTemplate(module, canAccessFleetOwner(req.user?.role));
    const fileName = importTemplateFileName(module);

    res.setHeader('Content-Type', EXCEL_MIME);
    res.setHeader('Content-Length', String(buffer.length));
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    );
    res.status(200).end(buffer);
  });

/**
 * Importa la planilla subida. Con `?dryRun=true` solo valida y devuelve la
 * vista previa; sin ese parámetro escribe en una transacción.
 */
export const importSpreadsheetHandler = (module: ImportModule) =>
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.file) {
      throw ApiError.badRequest('Debe adjuntar un archivo Excel .xlsx en el campo file');
    }

    const query = res.locals.validatedQuery as ImportRequestQuery | undefined;
    const dryRun = query?.dryRun ?? false;
    const previewToken = req.get('X-Import-Preview');
    if (previewToken && previewToken.length > 4096) {
      throw ApiError.badRequest('La vista previa no es válida. Vuelve a revisar el archivo.');
    }

    const result = await IMPORTERS[module](req.file.buffer, req.file.originalname, dryRun, {
      userId: req.user?.id,
      role: req.user?.role,
      warehouseId: query?.warehouseId,
      previewToken,
    });

    if (dryRun) {
      res.status(200).json({ preview: result });
      return;
    }

    res.status(201).json({ result });
  });
