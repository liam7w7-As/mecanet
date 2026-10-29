import { Blob as NodeBlob } from 'node:buffer';

import { IDBObjectStore } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { deleteFormDraft, loadFormDraft, saveFormDraft } from '../form-recovery';

const schema = z.object({ text: z.string(), photo: z.custom<Blob>().optional() });
afterEach(() => vi.restoreAllMocks());

describe('durable form recovery', () => {
  it('recovers partial text and the original photo bytes from IndexedDB', async () => {
    const photo = new NodeBlob(['original-photo-bytes'], { type: 'image/png' });
    await saveFormDraft(7, 'ot:new', { text: '1.', photo }, 'capture-a');
    const restored = await loadFormDraft(7, 'ot:new', schema);
    expect(restored?.payload.text).toBe('1.');
    expect(await restored?.payload.photo?.text()).toBe('original-photo-bytes');
    expect(restored?.payload.photo?.type).toBe('image/png');
  });
  it('isolates users, OT, COT and individual conversions', async () => {
    await saveFormDraft(7, 'ot:new', { text: 'OT' }, 'a');
    await saveFormDraft(7, 'cot:new', { text: 'COT' }, 'b');
    await saveFormDraft(7, 'ot:convert:44', { text: 'Conversion' }, 'c');
    expect(await loadFormDraft(8, 'ot:new', schema)).toBeNull();
    expect(await loadFormDraft(7, 'ot:convert:45', schema)).toBeNull();
    expect((await loadFormDraft(7, 'cot:new', schema))?.payload.text).toBe('COT');
    expect((await loadFormDraft(7, 'ot:new', schema))?.payload.text).toBe('OT');
  });
  it('reads after all queued edits and does not lose the final keystroke', async () => {
    const saves = ['a', 'ab', 'abc'].map((text) => saveFormDraft(7, 'ot', { text }, 'a'));
    const restored = loadFormDraft(7, 'ot', schema);
    await Promise.all(saves);
    expect((await restored)?.payload.text).toBe('abc');
  });
  it('keeps a pending capture until it is completed or explicitly discarded', async () => {
    const now = Date.now();
    await saveFormDraft(7, 'ot', { text: 'old' }, 'a');
    vi.spyOn(Date, 'now').mockReturnValue(now + 8 * 86400000);
    expect((await loadFormDraft(7, 'ot', schema))?.payload.text).toBe('old');
  });
  it('does not let a late completion erase a newer capture', async () => {
    await saveFormDraft(7, 'ot', { text: 'first' }, 'first');
    await deleteFormDraft(7, 'ot', 'first');
    await saveFormDraft(7, 'ot', { text: 'new form' }, 'second');
    await deleteFormDraft(7, 'ot', 'first');
    expect((await loadFormDraft(7, 'ot', schema))?.payload.text).toBe('new form');
    await expect(saveFormDraft(7, 'ot', { text: 'late write' }, 'first')).rejects.toThrow(
      'otra captura',
    );
  });
  it('preserves the previous recovery if browser storage runs out of space', async () => {
    await saveFormDraft(7, 'ot', { text: 'safe' }, 'a');
    const put = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => {
      throw new DOMException('Full', 'QuotaExceededError');
    });
    await expect(saveFormDraft(7, 'ot', { text: 'new' }, 'a')).rejects.toThrow('Full');
    put.mockRestore();
    expect((await loadFormDraft(7, 'ot', schema))?.payload.text).toBe('safe');
  });
  it('discards incompatible snapshots without crashing the form', async () => {
    await saveFormDraft(7, 'ot', { text: 123 }, 'a');
    expect(await loadFormDraft(7, 'ot', schema)).toBeNull();
  });
});
