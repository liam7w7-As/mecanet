import { z } from 'zod';

import { buildDirectoryExport } from '../services/exports/directory-export.service.js';
import {
  generateListExportExcel,
  generateListExportPdf,
} from '../services/exports/export-renderer.service.js';
import { buildLaborExport } from '../services/exports/labor-export.service.js';
import { buildOperationsExport } from '../services/exports/operations-export.service.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

import type { ListExportTarget } from '@unithor/shared';

export const getListExportHandler = asyncHandler(async (req, res): Promise<void> => {
  if (!req.user) throw ApiError.unauthorized();
  const target = req.params.target as ListExportTarget;
  const query = { ...req.query } as Record<string, unknown>;
  if (query.includeOwner !== undefined) {
    query.includeOwner = z
      .union([z.boolean(), z.enum(['true', 'false'])])
      .parse(query.includeOwner);
  }
  const actor = { id: req.user.id, role: req.user.role };
  const dataset =
    (await buildDirectoryExport(target, query, actor)) ??
    (await buildOperationsExport(target, query, actor)) ??
    (await buildLaborExport(target, query, actor));
  if (!dataset) throw ApiError.notFound('Listado no disponible para exportación');
  const pdf = req.params.format === 'pdf';
  const bytes = pdf ? await generateListExportPdf(dataset) : await generateListExportExcel(dataset);
  const filename = `UNITHOR-${target}-${Date.now()}.${pdf ? 'pdf' : 'xlsx'}`;
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader(
    'Content-Type',
    pdf ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
  res.setHeader('Content-Disposition', `${pdf ? 'inline' : 'attachment'}; filename="${filename}"`);
  res.setHeader('Content-Length', String(bytes.length));
  res.status(200).end(Buffer.from(bytes));
});
