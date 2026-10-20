import { createHash } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
} from '@aws-sdk/client-s3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { storageEnvSchema } from '../../config/storage.js';
import {
  assertStorageKey,
  LocalFileStorage,
  S3FileStorage,
  StoredFileNotFoundError,
} from '../file-storage.js';

const { send, clientOptions } = vi.hoisted(() => ({ send: vi.fn(), clientOptions: vi.fn() }));
vi.mock('@aws-sdk/client-s3', async (importOriginal) => {
  const original = await importOriginal<typeof import('@aws-sdk/client-s3')>();
  return {
    ...original,
    S3Client: class {
      constructor(options: unknown) {
        clientOptions(options);
      }
      send = send;
    },
  };
});

const config = storageEnvSchema.parse({
  STORAGE_DRIVER: 's3',
  S3_BUCKET: 'private-files',
  S3_ENDPOINT: 'https://example.r2.cloudflarestorage.com',
  S3_ACCESS_KEY_ID: 'test-access',
  S3_SECRET_ACCESS_KEY: 'test-secret',
});

describe('Storage configuration', () => {
  it('keeps development local and accepts blank optional S3 fields', () => {
    expect(storageEnvSchema.parse({ S3_ENDPOINT: '' }).STORAGE_DRIVER).toBe('local');
  });
  it('rejects incomplete S3 configuration', () => {
    const result = storageEnvSchema.safeParse({ STORAGE_DRIVER: 's3' });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues).toHaveLength(4);
  });
  it.each([
    'http://example.com',
    'https://user:secret@example.com',
    'https://example.com/bucket',
    'https://example.com/?token=secret',
  ])('rejects unsafe endpoints: %s', (endpoint) => {
    expect(storageEnvSchema.safeParse({ ...config, S3_ENDPOINT: endpoint }).success).toBe(false);
  });
  it.each([
    './storage/uploads',
    '/home/site/hbuilds/current/uploads',
    '/home/site/public_html/uploads',
  ])('blocks deployment-relative storage in production: %s', (root) => {
    expect(storageEnvSchema.safeParse({ NODE_ENV: 'production', UPLOAD_DIR: root }).success).toBe(
      false,
    );
  });
  it('accepts R2 production or an explicitly persistent absolute local directory', () => {
    expect(storageEnvSchema.safeParse({ ...config, NODE_ENV: 'production' }).success).toBe(true);
    expect(
      storageEnvSchema.safeParse({
        NODE_ENV: 'production',
        UPLOAD_DIR: path.resolve('persistent-files'),
      }).success,
    ).toBe(true);
  });
  it.each(['../escape', '/absolute', 'a/../b', 'a//b', 'C:/uploads/a', 'a\\..\\b', 'a\0b', ''])(
    'rejects unsafe object keys: %s',
    (key) => {
      expect(() => assertStorageKey(key)).toThrow();
    },
  );
});

describe('Local storage', () => {
  let root: string;
  let storage: LocalFileStorage;
  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'unithor-storage-'));
    storage = new LocalFileStorage(root);
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });
  it('writes atomically and survives a new provider instance', async () => {
    await storage.check();
    await storage.put('work-orders/123/photo.png', Buffer.from('photo'), 'image/png');
    expect(await new LocalFileStorage(root).read('work-orders/123/photo.png')).toEqual(
      Buffer.from('photo'),
    );
    expect(await readdir(path.join(root, 'work-orders/123'))).toEqual(['photo.png']);
  });
  it('retains deleted objects and removes only uncommitted uploads permanently', async () => {
    await storage.put('photo.png', Buffer.from('photo'), 'image/png');
    await storage.remove('photo.png');
    await expect(storage.read('photo.png')).rejects.toBeInstanceOf(StoredFileNotFoundError);
    const retained = await readdir(path.join(root, '_retained'), { recursive: true });
    const backup = retained.find((key) => key.endsWith('photo.png'));
    expect(backup).toBeDefined();
    expect(await storage.read(`_retained/${backup?.replaceAll(path.sep, '/')}`)).toEqual(
      Buffer.from('photo'),
    );
    await storage.put('orphan.png', Buffer.from('orphan'), 'image/png');
    await storage.remove('orphan.png', false);
    await expect(storage.read('orphan.png')).rejects.toBeInstanceOf(StoredFileNotFoundError);
    await expect(storage.remove('missing.png')).resolves.toBeUndefined();
  });
});

describe('Private S3/R2 storage', () => {
  beforeEach(() => {
    send.mockReset();
    clientOptions.mockReset();
  });
  it('uses explicit server credentials with bounded requests and no public ACL', async () => {
    const storage = new S3FileStorage(config);
    await storage.check();
    await storage.put('work-orders/1/photo.png', Buffer.from('photo'), 'image/png');
    expect(clientOptions).toHaveBeenCalledWith(
      expect.objectContaining({ region: 'auto', maxAttempts: 3, endpoint: config.S3_ENDPOINT }),
    );
    expect(send.mock.calls[0][0]).toBeInstanceOf(HeadBucketCommand);
    const command = send.mock.calls[1][0] as PutObjectCommand;
    expect(command).toBeInstanceOf(PutObjectCommand);
    expect(command.input).toMatchObject({
      Bucket: 'private-files',
      Key: 'unithor/work-orders/1/photo.png',
      ContentType: 'image/png',
      ContentLength: 5,
      Metadata: { sha256: createHash('sha256').update('photo').digest('hex') },
    });
    expect(command.input.ACL).toBeUndefined();
    expect(command.input.ContentMD5).toBe(createHash('md5').update('photo').digest('base64'));
  });
  it('reads bytes from the configured namespace', async () => {
    send.mockResolvedValueOnce({
      Body: { transformToByteArray: async () => Buffer.from('photo') },
    });
    expect(await new S3FileStorage(config).read('photo.png')).toEqual(Buffer.from('photo'));
    expect(send.mock.calls[0][0]).toBeInstanceOf(GetObjectCommand);
  });
  it('distinguishes missing objects from authentication or network failures', async () => {
    const storage = new S3FileStorage(config);
    send.mockRejectedValueOnce({ name: 'NoSuchKey' });
    await expect(storage.read('missing.png')).rejects.toBeInstanceOf(StoredFileNotFoundError);
    send.mockRejectedValueOnce({ name: 'AccessDenied' });
    await expect(storage.read('private.png')).rejects.toMatchObject({ name: 'AccessDenied' });
  });
  it('copies to recovery before deleting the active object', async () => {
    await new S3FileStorage(config).remove('photo.png');
    const copy = send.mock.calls[0][0] as CopyObjectCommand;
    expect(copy).toBeInstanceOf(CopyObjectCommand);
    expect(copy.input.CopySource).toBe('private-files/unithor/photo.png');
    expect(copy.input.Key).toMatch(/^unithor\/_retained\/\d{4}-\d{2}-\d{2}\/.+\/photo.png$/);
    expect(send.mock.calls[1][0]).toBeInstanceOf(DeleteObjectCommand);
  });
  it('does not delete the original if the recovery copy fails', async () => {
    send.mockRejectedValueOnce(new Error('network'));
    await expect(new S3FileStorage(config).remove('photo.png')).rejects.toThrow('network');
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('discards a rolled-back upload without retaining a copy', async () => {
    await new S3FileStorage(config).remove('orphan.png', false);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toBeInstanceOf(DeleteObjectCommand);
  });
});
