import { act, renderHook, waitFor } from '@testing-library/react';
import { IDBObjectStore } from 'fake-indexeddb';
import { useMemo } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { flushFormDrafts, loadFormDraft } from '../../lib/form-recovery';
import { useFormRecovery } from '../useFormRecovery';

const schema = z.object({ text: z.string() });
const mount = () => renderHook(({ text, paused }: { text: string; paused: boolean }) => {
  const value = useMemo(() => ({ text }), [text]);
  return useFormRecovery({ userId: 7, form: 'test', schema, value, hasContent: Boolean(text), paused, onRestore: () => undefined });
}, { initialProps: { text: '', paused: false } });
const leave = () => {
  const event = new Event('beforeunload', { cancelable: true });
  act(() => { window.dispatchEvent(event); });
  return event.defaultPrevented;
};
afterEach(() => vi.restoreAllMocks());

describe('recovery lifecycle', () => {
  it('warns while the latest edit is pending, then allows closing after it is saved', async () => {
    const view = mount();
    await waitFor(() => expect(view.result.current.ready).toBe(true));
    view.rerender({ text: 'last edit', paused: false });
    expect(leave()).toBe(true);
    await act(async () => { await flushFormDrafts(); });
    expect(leave()).toBe(false);
    expect((await loadFormDraft(7, 'test', schema))?.payload.text).toBe('last edit');
  });
  it('does not overwrite a created-record checkpoint with an older UI snapshot', async () => {
    const view = mount();
    await waitFor(() => expect(view.result.current.ready).toBe(true));
    view.rerender({ text: 'before save', paused: false });
    await act(async () => { await flushFormDrafts(); });
    view.rerender({ text: 'before save', paused: true });
    await act(async () => { await view.result.current.persist({ text: 'created OT, 2 photos saved' }); });
    view.rerender({ text: 'old UI value', paused: true });
    await act(async () => { await flushFormDrafts(); });
    expect((await loadFormDraft(7, 'test', schema))?.payload.text).toBe('created OT, 2 photos saved');
    await act(async () => { await view.result.current.clear(); });
    view.rerender({ text: 'old UI value', paused: false });
    window.dispatchEvent(new Event('pagehide'));
    await act(async () => { await flushFormDrafts(); });
    expect(await loadFormDraft(7, 'test', schema)).toBeNull();
  });
  it('shows storage failure and retries without discarding the live input', async () => {
    const view = mount();
    await waitFor(() => expect(view.result.current.ready).toBe(true));
    const put = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError'); });
    view.rerender({ text: 'keep this input', paused: false });
    await waitFor(() => expect(view.result.current.error).toBe(true));
    expect(view.result.current.savedAt).toBeNull();
    put.mockRestore();
    await act(async () => { await view.result.current.retry(); });
    expect(view.result.current.error).toBe(false);
    expect((await loadFormDraft(7, 'test', schema))?.payload.text).toBe('keep this input');
  });
});
