import { createHash } from 'node:crypto';

import { readStoredFile } from './file-storage.service.js';
import { CustomerEmail } from '../models/CustomerEmail.js';
import { ApiError } from '../utils/ApiError.js';

export const OFFICIAL_DOCUMENT_TEMPLATE = 'approved-web-v1';

export const loadCustomerDocumentAttachments = async (email: CustomerEmail) => {
  const documents = email.payload.documents ?? [];
  if (email.payload.documentTemplate !== OFFICIAL_DOCUMENT_TEMPLATE || documents.length === 0) {
    throw ApiError.conflict('El PDF oficial está pendiente de preparación');
  }
  return Promise.all(
    documents.map(async (document) => {
      const content = await readStoredFile(
        document.storageKey,
        'El PDF oficial no está disponible',
      );
      if (createHash('sha256').update(content).digest('hex') !== document.sha256) {
        throw ApiError.conflict('El PDF almacenado no coincide con el documento preparado');
      }
      return { filename: document.filename, content, contentType: 'application/pdf' };
    }),
  );
};
