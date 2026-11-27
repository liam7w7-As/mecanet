import sharp from 'sharp';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { env } from '../../config/env.js';
import { scanPurchaseReceipt } from '../purchase-scan.service.js';

const original = env.OPENAI_API_KEY;
let file: Express.Multer.File;
let userId = 90000;
const data = {
  documento: 'recibo',
  proveedorNombre: 'Proveedor',
  folio: '123',
  fechaEmision: null,
  totalComprobante: 23500,
  incluyeIva: true,
  items: [{ descripcion: 'Filtro', codigo: null, cantidad: 2, costoUnitario: 11900 }],
  advertencias: [],
};
const success = () => ({
  ok: true,
  json: async () => ({
    status: 'completed',
    output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(data) }] }],
  }),
});

describe('Luna purchase scanner', () => {
  beforeAll(async () => {
    const buffer = await sharp({
      create: { width: 24, height: 24, channels: 3, background: '#fff' },
    })
      .png()
      .toBuffer();
    file = {
      buffer,
      mimetype: 'image/png',
      size: buffer.length,
      originalname: 'recibo.png',
    } as Express.Multer.File;
  });
  beforeEach(() => {
    env.OPENAI_API_KEY = 'test-private-key';
    userId += 1;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => success()),
    );
  });
  afterEach(() => {
    env.OPENAI_API_KEY = original;
    vi.unstubAllGlobals();
  });
  it('uses Luna, image input, strict JSON and no tools or response storage', async () => {
    expect(await scanPurchaseReceipt(file, userId)).toEqual(data);
    const [url, request] = vi.mocked(fetch).mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/responses');
    const body = JSON.parse(request!.body as string);
    expect(body.model).toBe('gpt-6-luna');
    expect(body.store).toBe(false);
    expect(body.text.format.strict).toBe(true);
    expect(body.text.format.schema.required).toContain('totalComprobante');
    expect(body.tools).toBeUndefined();
    expect(body.input[0].content[1].image_url).toMatch(/^data:image\/jpeg;base64,/);
  });
  it('fails safely without a key and never calls OpenAI', async () => {
    env.OPENAI_API_KEY = '';
    await expect(scanPurchaseReceipt(file, userId)).rejects.toMatchObject({ statusCode: 503 });
    expect(fetch).not.toHaveBeenCalled();
  });
  it('rejects forged files before making a billable request', async () => {
    await expect(
      scanPurchaseReceipt({ ...file, buffer: Buffer.from('not an image') }, userId),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(['incomplete', 'refusal', 'invalid', 'http'])(
    'handles %s without returning invented fields',
    async (mode) => {
      vi.mocked(fetch).mockResolvedValue({
        ok: mode !== 'http',
        json: async () => ({
          status: mode === 'incomplete' ? 'incomplete' : 'completed',
          output: [
            {
              type: 'message',
              content: [
                {
                  type: mode === 'refusal' ? 'refusal' : 'output_text',
                  text: '{"items":[{"costoUnitario":-100}]}',
                },
              ],
            },
          ],
        }),
      } as Response);
      await expect(scanPurchaseReceipt(file, userId)).rejects.toMatchObject({
        statusCode: 502,
        code: 'SCAN_UNAVAILABLE',
      });
    },
  );
  it('limits repeated paid attempts per user', async () => {
    for (let index = 0; index < 6; index += 1) await scanPurchaseReceipt(file, userId);
    await expect(scanPurchaseReceipt(file, userId)).rejects.toMatchObject({ statusCode: 429 });
    expect(fetch).toHaveBeenCalledTimes(6);
  });
});
