import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { usePwaInstall } from '../usePwaInstall';

const installEvent = (outcome: 'accepted' | 'dismissed' = 'dismissed') => Object.assign(
  new Event('beforeinstallprompt', { cancelable: true }),
  {
    platforms: ['web'],
    prompt: vi.fn(async () => {}),
    userChoice: Promise.resolve({ outcome, platform: 'web' }),
  },
);

describe('usePwaInstall', () => {
  beforeEach(() => {
    window.dispatchEvent(new Event('appinstalled'));
  });

  it('recupera el evento de instalación recibido antes de montar React', () => {
    const event = installEvent();
    window.dispatchEvent(event);
    const { result } = renderHook(() => usePwaInstall());
    expect(event.defaultPrevented).toBe(true);
    expect(result.current.hasNativePrompt).toBe(true);
    expect(event.prompt).not.toHaveBeenCalled();
  });

  it('comparte y consume cada evento una sola vez entre los botones de instalación', async () => {
    const first = renderHook(() => usePwaInstall());
    const second = renderHook(() => usePwaInstall());
    const dismissed = installEvent();
    act(() => { window.dispatchEvent(dismissed); });
    expect(first.result.current.hasNativePrompt).toBe(true);
    expect(second.result.current.hasNativePrompt).toBe(true);
    await act(async () => { await first.result.current.triggerInstall(); });
    expect(first.result.current.isInstalled).toBe(false);
    expect(first.result.current.hasNativePrompt).toBe(false);
    expect(second.result.current.hasNativePrompt).toBe(false);
    await act(async () => { await second.result.current.triggerInstall(); });
    expect(dismissed.prompt).toHaveBeenCalledTimes(1);
    expect(second.result.current.showInstructions).toBe(true);

    const accepted = installEvent('accepted');
    act(() => { window.dispatchEvent(accepted); });
    await act(async () => { await second.result.current.triggerInstall(); });
    expect(accepted.prompt).toHaveBeenCalledTimes(1);
    expect(second.result.current.isInstalled).toBe(true);
    expect(second.result.current.showInstructions).toBe(false);
  });

  it('muestra instrucciones sin prompt y las cierra al confirmar el navegador la instalación', async () => {
    const { result } = renderHook(() => usePwaInstall());
    await act(async () => { await result.current.triggerInstall(); });
    expect(result.current.showInstructions).toBe(true);
    act(() => { window.dispatchEvent(new Event('appinstalled')); });
    expect(result.current.isInstalled).toBe(true);
    expect(result.current.isInstallable).toBe(false);
    expect(result.current.showInstructions).toBe(false);
  });

  it('ofrece instrucciones si falla el diálogo nativo sin reutilizar el evento fallido', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { result } = renderHook(() => usePwaInstall());
      const event = installEvent();
      event.prompt.mockRejectedValueOnce(new Error('Prompt unavailable'));
      act(() => { window.dispatchEvent(event); });
      await act(async () => { await result.current.triggerInstall(); });
      expect(result.current.showInstructions).toBe(true);
      expect(result.current.hasNativePrompt).toBe(false);
      await act(async () => { await result.current.triggerInstall(); });
      expect(event.prompt).toHaveBeenCalledTimes(1);
      expect(warning).toHaveBeenCalledOnce();
    } finally {
      warning.mockRestore();
    }
  });
});
