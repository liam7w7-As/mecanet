import { createHash, randomUUID } from 'node:crypto';

import { PDFDocument } from 'pdf-lib';
import { Op, literal } from 'sequelize';

import { OFFICIAL_DOCUMENT_TEMPLATE } from './customer-document-pdf.service.js';
import { wakeEmailQueue } from './customer-email-queue.service.js';
import { removeStoredFile, storeFile } from './file-storage.service.js';
import { hasPermission } from './permission.service.js';
import { getQuotationById } from './quotation.service.js';
import { getPublicBranding } from './settings.service.js';
import { assertWorkOrderManagementAccess, getWorkOrderById } from './work-order.service.js';
import { sequelize } from '../config/database.js';
import { env } from '../config/env.js';
import { CustomerEmail } from '../models/CustomerEmail.js';
import { WorkOrderInspection } from '../models/WorkOrderInspection.js';
import { WorkOrderInspectionPhoto } from '../models/WorkOrderInspectionPhoto.js';
import { ApiError } from '../utils/ApiError.js';

import type { CustomerEmailDocument } from '../models/CustomerEmail.js';

export const assertEmailPreparationAccess = async (
  email: CustomerEmail,
  userId: number,
): Promise<void> => {
  if (!(await hasPermission(userId, email.kind === 'quotation' ? 'comercial' : 'taller', 'read'))) {
    throw ApiError.forbidden('No tienes permiso para preparar este documento');
  }
  if (email.kind === 'quotation') await getQuotationById(email.entityId, userId);
  else await assertWorkOrderManagementAccess(email.entityId, userId);
};

export const emailPhotosReady = async (email: CustomerEmail): Promise<boolean> => {
  const expected = email.payload.expectedPhotoSlots ?? [];
  if (!expected.length) return true;
  const inspection = await WorkOrderInspection.findOne({
    where: { workOrderId: email.entityId },
    attributes: ['id'],
  });
  const photos = inspection
    ? await WorkOrderInspectionPhoto.findAll({
        where: { inspectionId: inspection.id },
        attributes: ['slot'],
      })
    : [];
  return expected.every((slot) => photos.some((photo) => photo.slot === slot));
};

export const listEmailPreparations = async (userId: number, role: string) => {
  if (!env.MAIL_ENABLED || role === 'mecanico') return { enabled: env.MAIL_ENABLED, jobs: [] };
  const [workshop, commercial] = await Promise.all([
    hasPermission(userId, 'taller', 'read'),
    hasPermission(userId, 'comercial', 'read'),
  ]);
  const kinds = [workshop ? 'work_order' : null, commercial ? 'quotation' : null].filter(
    (kind): kind is 'work_order' | 'quotation' => kind !== null,
  );
  if (!kinds.length) return { enabled: true, jobs: [] };
  const emails = await CustomerEmail.findAll({
    where: {
      category: 'document',
      kind: { [Op.in]: kinds },
      status: { [Op.in]: ['waiting_documents', 'waiting_photos'] },
      nextAttemptAt: { [Op.lte]: new Date() },
      ...(role === 'vendedor'
        ? {
            [Op.and]: [
              literal(
                "((CustomerEmail.kind = 'quotation' AND EXISTS (SELECT 1 FROM quotations q WHERE q.id = CustomerEmail.entity_id AND q.asesor_id = " +
                  Number(userId) +
                  " AND q.deleted_at IS NULL)) OR (CustomerEmail.kind = 'work_order' AND EXISTS (SELECT 1 FROM work_orders ot WHERE ot.id = CustomerEmail.entity_id AND ot.created_by = " +
                  Number(userId) +
                  ' AND ot.deleted_at IS NULL)))',
              ),
            ],
          }
        : {}),
    },
    order: [['id', 'ASC']],
    limit: 20,
  });
  const jobs: Array<{ id: number }> = [];
  for (const email of emails) {
    if (await emailPhotosReady(email)) jobs.push({ id: email.id });
    if (jobs.length === 3) break;
  }
  return { enabled: true, jobs };
};

export const getEmailPreparation = async (id: number, userId: number) => {
  const email = await CustomerEmail.findByPk(id);
  if (!email || email.category !== 'document') throw ApiError.notFound('Envío no encontrado');
  await assertEmailPreparationAccess(email, userId);
  if (!['waiting_documents', 'waiting_photos', 'pending'].includes(email.status)) {
    throw ApiError.conflict('Este envío ya no está pendiente de preparación');
  }
  if (!(await emailPhotosReady(email)))
    throw ApiError.conflict('Las fotos de recepción todavía se están cargando');
  const documents = [];
  if (email.kind === 'quotation') {
    const quotation = await getQuotationById(email.entityId, userId);
    documents.push({
      type: 'quotation' as const,
      id: quotation.id,
      filename: quotation.codigo + '.pdf',
      quotation,
    });
  } else {
    const workOrder = await getWorkOrderById(email.entityId, userId);
    documents.push({
      type: 'work-order' as const,
      id: workOrder.id,
      filename: workOrder.codigo + '.pdf',
      workOrder,
    });
    if (email.payload.includeQuotation && workOrder.quotation) {
      const quotation = await getQuotationById(workOrder.quotation.id, userId);
      documents.push({
        type: 'quotation' as const,
        id: quotation.id,
        filename: quotation.codigo + '.pdf',
        quotation,
      });
    }
  }
  const branding = await getPublicBranding();
  const revision = createHash('sha256')
    .update(JSON.stringify({ documents, branding }))
    .digest('hex');
  return { id, revision, branding, documents };
};

export const savePreparedEmailDocuments = async (
  id: number,
  userId: number,
  revision: string,
  files: Express.Multer.File[],
): Promise<void> => {
  const bundle = await getEmailPreparation(id, userId);
  if (bundle.revision !== revision)
    throw ApiError.conflict(
      'La información cambió mientras se preparaba el PDF. Se volverá a preparar.',
    );
  if (
    files.length !== bundle.documents.length ||
    new Set(files.map((file) => file.originalname)).size !== files.length
  ) {
    throw ApiError.badRequest('Debe adjuntar todos los documentos oficiales del envío');
  }
  if (files.reduce((total, file) => total + file.size, 0) > 18 * 1024 * 1024)
    throw ApiError.badRequest('Los documentos superan el tamaño permitido');
  const documents: CustomerEmailDocument[] = [];
  try {
    for (const expected of bundle.documents) {
      const file = files.find((candidate) => candidate.originalname === expected.filename);
      if (
        !file ||
        file.mimetype !== 'application/pdf' ||
        file.buffer.subarray(0, 5).toString() !== '%PDF-'
      )
        throw ApiError.badRequest('El archivo debe ser un PDF válido');
      let pageCount: number;
      try {
        pageCount = (await PDFDocument.load(file.buffer)).getPageCount();
      } catch {
        throw ApiError.badRequest('El archivo PDF no se pudo leer');
      }
      if (pageCount < 1 || pageCount > 60 || (expected.type === 'work-order' && pageCount !== 2))
        throw ApiError.badRequest('El PDF no contiene las páginas esperadas');
      const storageKey = 'customer-email-documents/' + id + '/' + randomUUID() + '.pdf';
      await storeFile(storageKey, file.buffer, 'application/pdf');
      documents.push({
        kind: expected.type === 'quotation' ? 'quotation' : 'work_order',
        entityId: expected.id,
        filename: expected.filename,
        storageKey,
        sha256: createHash('sha256').update(file.buffer).digest('hex'),
      });
    }
    const current = await getEmailPreparation(id, userId);
    if (current.revision !== revision)
      throw ApiError.conflict(
        'La información cambió mientras se preparaba el PDF. Se volverá a preparar.',
      );
    await sequelize.transaction(async (transaction) => {
      const email = await CustomerEmail.findByPk(id, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (
        !email ||
        !['waiting_documents', 'waiting_photos', 'pending'].includes(email.status) ||
        email.payload.documents?.length
      )
        throw ApiError.conflict('El envío ya tiene sus documentos preparados');
      await email.update(
        {
          status: 'pending',
          nextAttemptAt: new Date(),
          attempts: 0,
          lastError: null,
          payload: {
            ...email.payload,
            documentTemplate: OFFICIAL_DOCUMENT_TEMPLATE,
            documents,
            documentRevision: revision,
          },
        },
        { transaction },
      );
      transaction.afterCommit(() => {
        wakeEmailQueue();
      });
    });
  } catch (error) {
    await Promise.all(documents.map((document) => removeStoredFile(document.storageKey, false)));
    throw error;
  }
};

export const reportEmailPreparationError = async (id: number, userId: number): Promise<void> => {
  const email = await CustomerEmail.findByPk(id);
  if (!email) throw ApiError.notFound('Envío no encontrado');
  await assertEmailPreparationAccess(email, userId);
  await CustomerEmail.update(
    {
      lastError: 'PDF_PREPARATION_FAILED',
      nextAttemptAt: new Date(Date.now() + 30_000),
    },
    { where: { id, status: { [Op.in]: ['waiting_documents', 'waiting_photos'] } } },
  );
};
