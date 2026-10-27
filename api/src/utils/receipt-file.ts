import path from 'node:path';

import { ApiError } from './ApiError.js';

export interface DetectedReceiptFile {
  mimeType: string;
  extension: 'pdf' | 'jpg' | 'png' | 'webp';
}

export const isPng = (buffer: Buffer): boolean =>
  buffer.length >= 20 &&
  buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) &&
  buffer.subarray(-8).equals(Buffer.from([0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]));

export const isJpeg = (buffer: Buffer): boolean =>
  buffer.length >= 5 &&
  buffer[0] === 0xff &&
  buffer[1] === 0xd8 &&
  buffer[2] === 0xff &&
  buffer[buffer.length - 2] === 0xff &&
  buffer[buffer.length - 1] === 0xd9;

export const isWebp = (buffer: Buffer): boolean =>
  buffer.length >= 12 &&
  buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
  buffer.subarray(8, 12).toString('ascii') === 'WEBP' &&
  buffer.readUInt32LE(4) + 8 === buffer.length;

export const isPdf = (buffer: Buffer): boolean =>
  buffer.length >= 5 && buffer.subarray(0, 5).toString('ascii') === '%PDF-';

export const detectReceiptFile = (file: Express.Multer.File): DetectedReceiptFile => {
  const declaredMime = file.mimetype.toLowerCase();
  const detected: DetectedReceiptFile | null = isPdf(file.buffer)
    ? { mimeType: 'application/pdf', extension: 'pdf' }
    : isJpeg(file.buffer)
      ? { mimeType: 'image/jpeg', extension: 'jpg' }
      : isPng(file.buffer)
        ? { mimeType: 'image/png', extension: 'png' }
        : isWebp(file.buffer)
          ? { mimeType: 'image/webp', extension: 'webp' }
          : null;

  if (!detected) {
    throw ApiError.badRequest('El contenido del comprobante no corresponde a un PDF o imagen válida');
  }
  if (declaredMime !== detected.mimeType) {
    throw ApiError.badRequest('El tipo declarado del comprobante no coincide con su contenido');
  }

  return detected;
};

export const getReceiptMimeType = (storageKey: string, bytes: Buffer): string => {
  const extension = path.extname(storageKey).toLowerCase();
  if (extension === '.pdf' && isPdf(bytes)) return 'application/pdf';
  if ((extension === '.jpg' || extension === '.jpeg') && isJpeg(bytes)) return 'image/jpeg';
  if (extension === '.png' && isPng(bytes)) return 'image/png';
  if (extension === '.webp' && isWebp(bytes)) return 'image/webp';
  throw ApiError.badRequest('El comprobante almacenado tiene un formato inválido');
};
