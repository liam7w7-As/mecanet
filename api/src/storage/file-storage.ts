import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { access, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

import type { StorageConfig } from '../config/storage.js';

export class StoredFileNotFoundError extends Error {
  constructor() {
    super('Archivo almacenado no encontrado');
    this.name = 'StoredFileNotFoundError';
  }
}

export interface FileStorage {
  check(): Promise<void>;
  put(key: string, bytes: Buffer, mimeType: string): Promise<void>;
  read(key: string): Promise<Buffer>;
  // retain=false is only for an upload whose database transaction failed.
  remove(key: string, retain?: boolean): Promise<void>;
}

export const assertStorageKey = (key: string): void => {
  if (
    !key ||
    key.includes('\\') ||
    key.includes(':') ||
    [...key].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) ||
    key.split('/').some((part) => !part || part === '.' || part === '..')
  ) {
    throw new Error('Clave de almacenamiento invalida');
  }
};

const retainedKey = (key: string): string =>
  `_retained/${new Date().toISOString().slice(0, 10)}/${randomUUID()}/${key}`;
const hasCode = (error: unknown, code: string): boolean =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === code;

export class LocalFileStorage implements FileStorage {
  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  private resolve(key: string): string {
    assertStorageKey(key);
    return path.join(this.root, ...key.split('/'));
  }

  async check(): Promise<void> {
    await mkdir(this.root, { recursive: true });
    await access(this.root, constants.R_OK | constants.W_OK);
  }

  async put(key: string, bytes: Buffer, _mimeType: string): Promise<void> {
    const destination = this.resolve(key);
    const temporary = `${destination}.${randomUUID()}.tmp`;
    await mkdir(path.dirname(destination), { recursive: true });
    try {
      await writeFile(temporary, bytes, { flag: 'wx' });
      await rename(temporary, destination);
    } finally {
      await unlink(temporary).catch((error: unknown) => {
        if (!hasCode(error, 'ENOENT')) throw error;
      });
    }
  }

  async read(key: string): Promise<Buffer> {
    try {
      return await readFile(this.resolve(key));
    } catch (error) {
      if (hasCode(error, 'ENOENT')) throw new StoredFileNotFoundError();
      throw error;
    }
  }

  async remove(key: string, retain = true): Promise<void> {
    const source = this.resolve(key);
    try {
      if (retain) {
        const destination = this.resolve(retainedKey(key));
        await mkdir(path.dirname(destination), { recursive: true });
        await rename(source, destination);
      } else {
        await unlink(source);
      }
    } catch (error) {
      if (!hasCode(error, 'ENOENT')) throw error;
    }
  }
}

const isMissingObject = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'name' in error &&
  (error.name === 'NoSuchKey' || error.name === 'NotFound');

export class S3FileStorage implements FileStorage {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly prefix: string;

  constructor(config: StorageConfig) {
    if (
      !config.S3_ENDPOINT ||
      !config.S3_BUCKET ||
      !config.S3_ACCESS_KEY_ID ||
      !config.S3_SECRET_ACCESS_KEY
    )
      throw new Error('Configuracion S3 incompleta');
    this.bucket = config.S3_BUCKET;
    this.prefix = config.S3_PREFIX;
    this.client = new S3Client({
      endpoint: config.S3_ENDPOINT,
      region: config.S3_REGION,
      credentials: {
        accessKeyId: config.S3_ACCESS_KEY_ID,
        secretAccessKey: config.S3_SECRET_ACCESS_KEY,
      },
      maxAttempts: 3,
      requestHandler: { connectionTimeout: 5_000, requestTimeout: 30_000 },
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }

  private key(key: string): string {
    assertStorageKey(key);
    return this.prefix ? `${this.prefix}/${key}` : key;
  }

  async check(): Promise<void> {
    await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
  }

  async put(key: string, bytes: Buffer, mimeType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: this.key(key),
        Body: bytes,
        ContentType: mimeType,
        ContentLength: bytes.length,
        ContentMD5: createHash('md5').update(bytes).digest('base64'),
        Metadata: { sha256: createHash('sha256').update(bytes).digest('hex') },
      }),
    );
  }

  async read(key: string): Promise<Buffer> {
    try {
      const object = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: this.key(key) }),
      );
      if (!object.Body) throw new Error('El almacenamiento devolvio un archivo sin contenido');
      return Buffer.from(await object.Body.transformToByteArray());
    } catch (error) {
      if (isMissingObject(error)) throw new StoredFileNotFoundError();
      throw error;
    }
  }

  async remove(key: string, retain = true): Promise<void> {
    const source = this.key(key);
    if (retain) {
      try {
        await this.client.send(
          new CopyObjectCommand({
            Bucket: this.bucket,
            Key: this.key(retainedKey(key)),
            CopySource: `${this.bucket}/${source.split('/').map(encodeURIComponent).join('/')}`,
          }),
        );
      } catch (error) {
        if (isMissingObject(error)) return;
        throw error;
      }
    }
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: source }));
  }
}

export const createFileStorage = (config: StorageConfig): FileStorage =>
  config.STORAGE_DRIVER === 's3'
    ? new S3FileStorage(config)
    : new LocalFileStorage(config.UPLOAD_DIR);
