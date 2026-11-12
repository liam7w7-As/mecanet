import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
    vi.stubGlobal('isSecureContext', true);
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: {} });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(navigator, 'serviceWorker');
    Reflect.deleteProperty(navigator, 'maxTouchPoints');
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
    expect(second.result.current.isInstalled).toBe(false);
    expect(second.result.current.showInstructions).toBe(false);
    act(() => { window.dispatchEvent(new Event('appinstalled')); });
    expect(first.result.current.isInstalled).toBe(true);
    expect(second.result.current.isInstalled).toBe(true);
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

  it('distingue las instrucciones de una instalación nativa disponible', () => {
    const { result } = renderHook(() => usePwaInstall());
    expect(result.current.canShowInstallHelp).toBe(true);
    expect(result.current.isInstallable).toBe(false);
    act(() => { window.dispatchEvent(installEvent()); });
    expect(result.current.isInstallable).toBe(true);
  });

  it('no ofrece instalación en HTTP remoto ni en navegadores sin service worker', () => {
    vi.stubGlobal('isSecureContext', false);
    const insecure = renderHook(() => usePwaInstall());
    expect(insecure.result.current.canShowInstallHelp).toBe(false);
    vi.stubGlobal('isSecureContext', true);
    Reflect.deleteProperty(navigator, 'serviceWorker');
    const unsupported = renderHook(() => usePwaInstall());
    expect(unsupported.result.current.canShowInstallHelp).toBe(false);
  });

  it('reconoce iPadOS con agente de escritorio para mostrar las instrucciones de Safari', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Macintosh; Intel Mac OS X)');
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
    Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: 5 });
    const { result } = renderHook(() => usePwaInstall());
    expect(result.current.platform).toBe('ios');
  });

  it('observa el cambio a modo standalone sin depender de appinstalled', () => {
    const media = Object.assign(new EventTarget(), { matches: false });
    vi.spyOn(window, 'matchMedia').mockReturnValue(media as unknown as MediaQueryList);
    const { result } = renderHook(() => usePwaInstall());
    expect(result.current.isInstalled).toBe(false);
    act(() => { media.matches = true; media.dispatchEvent(new Event('change')); });
    expect(result.current.isInstalled).toBe(true);
    expect(result.current.canShowInstallHelp).toBe(false);
  });
});
