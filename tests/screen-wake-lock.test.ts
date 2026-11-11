import { afterEach, describe, expect, it, vi } from 'vitest';
import { ScreenWakeLock } from '../src/app/services/screen-wake-lock';

describe('ScreenWakeLock', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('richiede il blocco schermo e lo rilascia allo stop', async () => {
    const release = vi.fn().mockResolvedValue(undefined);
    const request = vi.fn().mockResolvedValue({ release });
    vi.stubGlobal('navigator', { wakeLock: { request } });
    vi.stubGlobal('document', { visibilityState: 'visible', addEventListener: vi.fn(), removeEventListener: vi.fn() });
    const lock = new ScreenWakeLock();
    lock.start();
    await Promise.resolve();
    await Promise.resolve();
    expect(request).toHaveBeenCalledWith('screen');
    lock.stop();
    expect(release).toHaveBeenCalled();
  });

  it('non fallisce se l’API non è disponibile', () => {
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('document', { visibilityState: 'visible', addEventListener: vi.fn(), removeEventListener: vi.fn() });
    const lock = new ScreenWakeLock();
    expect(() => { lock.start(); lock.stop(); }).not.toThrow();
  });
});
