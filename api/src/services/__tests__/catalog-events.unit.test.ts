import { EventEmitter } from 'node:events';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ permission: vi.fn(), token: vi.fn() }));
vi.mock('../catalog.service.js', () => ({}));
vi.mock('../permission.service.js', () => ({ hasPermission: mocks.permission }));
vi.mock('../../utils/jwt.js', () => ({ verifyAccessToken: mocks.token }));

import { getCatalogEventsHandler } from '../../controllers/catalog.controller.js';
import { publishCatalogChange } from '../catalog-events.service.js';

import type { Request, Response } from 'express';

class StreamResponse extends EventEmitter {
  writableEnded = false;
  status = vi.fn(() => this);
  set = vi.fn(() => this);
  flushHeaders = vi.fn();
  write = vi.fn((_chunk: string) => true);
  end = vi.fn(() => { this.writableEnded = true; });
}

const drain = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

describe('authorized catalog SSE lifecycle without a database', () => {
  let request: EventEmitter & { user?: { id: number }; cookies: { access_token: string } };
  let response: StreamResponse;
  const next = vi.fn();
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mocks.permission.mockResolvedValue(true);
    mocks.token.mockReturnValue({ sub: 7 });
    request = Object.assign(new EventEmitter(), { user: { id: 7 }, cookies: { access_token: 'test-cookie' } });
    response = new StreamResponse();
  });
  afterEach(() => {
    response.emit('close');
    vi.useRealTimers();
  });
  const open = (): void => {
    getCatalogEventsHandler(request as unknown as Request, response as unknown as Response, next);
  };

  it('streams committed invalidation signals without broadcasting catalog data', async () => {
    open();
    expect(response.set).toHaveBeenCalledWith(expect.objectContaining({
      'Content-Type': 'text/event-stream; charset=utf-8', 'X-Accel-Buffering': 'no',
    }));
    publishCatalogChange();
    await drain();
    const sent = response.write.mock.calls.map(([message]) => message).join('');
    expect(sent).toContain('event: catalog-changed');
    expect(sent).toMatch(/"revision":"[a-f0-9-]+"/);
    expect(sent).not.toContain('precio');
    expect(mocks.permission).toHaveBeenCalledWith(7, 'taller', 'read');
  });

  it('closes and unsubscribes when read permission is revoked', async () => {
    open();
    response.write.mockClear();
    mocks.permission.mockResolvedValue(false);
    publishCatalogChange();
    await drain();
    expect(response.end).toHaveBeenCalledOnce();
    expect(response.write).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    publishCatalogChange();
    await drain();
    expect(response.write).not.toHaveBeenCalled();
  });

  it('closes on expired authentication and releases timers after a disconnect', async () => {
    open();
    mocks.token.mockImplementation(() => { throw new Error('expired'); });
    await vi.advanceTimersByTimeAsync(15_000);
    expect(response.end).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('stops after 55 seconds so the next connection reauthenticates', async () => {
    open();
    await vi.advanceTimersByTimeAsync(55_000);
    expect(response.end).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not register a stream without an authenticated identity', async () => {
    request.user = undefined;
    open();
    await drain();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401 }));
    expect(response.flushHeaders).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
