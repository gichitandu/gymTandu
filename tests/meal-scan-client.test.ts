import '@angular/compiler';
import { createEnvironmentInjector, EnvironmentInjector, signal } from '@angular/core';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AuthService } from '../src/app/services/auth';
import { MealScanLimitError, MealScanService } from '../src/app/services/meal-scan';
import * as images from '../src/app/services/images';

// Dati sintetici: nessuna richiesta reale, il server è sostituito da fetch simulato.
const NOON = Date.UTC(2026, 10, 14, 12), RESET = Date.UTC(2026, 10, 15), KEY = 'gymtrack-meal-scan-block-v1';
const photo = new Blob(['foto'], { type: 'image/jpeg' });
const status = (extra: any = {}) => ({ available: true, blocked: false, used: 120, cap: 9500, limit: 10000, usedPercent: 1.2, thresholdPercent: 95, requests: 4, remainingScans: 93, resetAt: RESET, ...extra });
const item = { name: 'Riso', grams: 180, calories: 234, protein: 4.9, carbs: 50.8, fat: 0.5 };
const reply = (body: any, code = 200) => new Response(JSON.stringify(body), { status: code, headers: { 'Content-Type': 'application/json' } });

let injector: EnvironmentInjector | undefined, storage: Map<string, string>, fetchMock: ReturnType<typeof vi.fn>;
const auth = { user: signal<any>({ id: 'account' }), offlineMode: signal(false) };
function service() {
  injector = createEnvironmentInjector([{ provide: AuthService, useValue: auth }, MealScanService], null as unknown as EnvironmentInjector);
  return injector.get(MealScanService);
}
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(NOON);
  storage = new Map(); auth.user.set({ id: 'account' }); auth.offlineMode.set(false);
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => { storage.set(key, value); }, removeItem: (key: string) => { storage.delete(key); } });
  fetchMock = vi.fn(async () => reply(status())); vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(images, 'photoDataUrl').mockResolvedValue('data:image/jpeg;base64,AAAA');
});
afterEach(() => { injector?.destroy(); injector = undefined; vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('invia la foto ridotta e restituisce solo alimenti validi', async () => {
  fetchMock.mockResolvedValue(reply({ kind: 'plate', dish: 'Riso', items: [item, { name: 'Rotto', grams: -1, calories: 1, protein: 0, carbs: 0, fat: 0 }, { name: 'Testo', grams: 10, calories: 'molte', protein: 0, carbs: 0, fat: 0 }], status: status({ used: 143, usedPercent: 1.4 }) }));
  const scan = service(), result = await scan.scan(photo);
  expect(result).toEqual({ kind: 'plate', dish: 'Riso', items: [item] });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
  expect(url).toBe('/api/meal-scan'); expect(options.method).toBe('POST'); expect(options.credentials).toBe('same-origin');
  expect(JSON.parse(String(options.body))).toEqual({ image: 'data:image/jpeg;base64,AAAA' });
  expect(scan.status()?.usedPercent).toBe(1.4); expect(scan.blocked()).toBe(false); expect(scan.busy()).toBe(false);
});

it('quando il server segnala il limite ricorda il blocco e non invia più alcuna richiesta fino al ripristino', async () => {
  fetchMock.mockResolvedValue(reply({ error: 'Limite giornaliero dell’AI quasi raggiunto: attendere ripristino.', code: 'AI_LIMIT', status: status({ blocked: true, remainingScans: 0, usedPercent: 94.6 }) }, 429));
  const scan = service();
  await expect(scan.scan(photo)).rejects.toBeInstanceOf(MealScanLimitError);
  expect(scan.blocked()).toBe(true); expect(scan.blockedUntil()).toBe(RESET);
  expect(JSON.parse(storage.get(KEY)!)).toEqual({ until: RESET });
  expect(scan.waitMessage()).toContain('Attendere ripristino');
  fetchMock.mockClear();
  await expect(scan.scan(photo)).rejects.toBeInstanceOf(MealScanLimitError);
  expect(await scan.ensureStatus(true)).toMatchObject({ blocked: true });
  expect(fetchMock).not.toHaveBeenCalled(); expect(images.photoDataUrl).toHaveBeenCalledTimes(1);
});

it('il blocco resta attivo dopo la riapertura dell’app e si toglie da solo al ripristino', async () => {
  storage.set(KEY, JSON.stringify({ until: RESET }));
  const scan = service();
  expect(scan.blocked()).toBe(true);
  expect(await scan.ensureStatus()).toBeNull();
  await expect(scan.scan(photo)).rejects.toBeInstanceOf(MealScanLimitError);
  expect(fetchMock).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(RESET - NOON - 1000); expect(scan.blocked()).toBe(true); expect(fetchMock).not.toHaveBeenCalled();
  fetchMock.mockResolvedValue(reply(status({ used: 0, usedPercent: 0, resetAt: RESET + 86400000 })));
  await vi.advanceTimersByTimeAsync(3000);
  expect(scan.blocked()).toBe(false); expect(storage.has(KEY)).toBe(false);
  expect(fetchMock).toHaveBeenCalledTimes(1); expect(scan.status()).toMatchObject({ blocked: false, used: 0 });
});

it('uno stato bloccato letto dal server ferma le letture prima ancora di provarci', async () => {
  fetchMock.mockResolvedValue(reply(status({ blocked: true, remainingScans: 0 })));
  const scan = service();
  expect(await scan.ensureStatus()).toMatchObject({ blocked: true });
  expect(scan.blocked()).toBe(true); fetchMock.mockClear();
  await expect(scan.scan(photo)).rejects.toBeInstanceOf(MealScanLimitError);
  expect(fetchMock).not.toHaveBeenCalled(); expect(images.photoDataUrl).not.toHaveBeenCalled();
});

it('ignora un blocco salvato non valido o già scaduto', () => {
  storage.set(KEY, JSON.stringify({ until: NOON - 1 })); expect(service().blocked()).toBe(false); injector!.destroy();
  storage.set(KEY, JSON.stringify({ until: NOON + 5 * 86400000 })); expect(service().blocked()).toBe(false); injector!.destroy();
  storage.set(KEY, '{non json'); expect(service().blocked()).toBe(false);
});

it('offline o senza account non contatta il server', async () => {
  auth.offlineMode.set(true);
  const scan = service();
  expect(await scan.ensureStatus()).toBeNull();
  await expect(scan.scan(photo)).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
  auth.offlineMode.set(false); auth.user.set(null);
  expect(await scan.ensureStatus()).toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
});

it('riporta gli errori del server senza bloccare e segnala il servizio non configurato', async () => {
  const scan = service();
  fetchMock.mockResolvedValue(reply({ error: 'Analisi della foto non riuscita.', code: 'AI_ERROR', status: status() }, 502));
  await expect(scan.scan(photo)).rejects.toThrow('Analisi della foto non riuscita.');
  expect(scan.blocked()).toBe(false); expect(scan.busy()).toBe(false);
  fetchMock.mockResolvedValue(reply({ error: 'Lettura foto con AI non configurata su questo server.', code: 'AI_UNAVAILABLE', status: status({ available: false }) }, 503));
  await expect(scan.scan(photo)).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
  fetchMock.mockResolvedValue(new Response('<html>', { status: 404 }));
  expect(await scan.ensureStatus(true)).toBeNull();
});

it('correct() invia solo nome e grammi e restituisce la prima voce valida', async () => {
  fetchMock.mockResolvedValue(reply({ kind: 'plate', dish: '', items: [item], status: status() }));
  const scan = service();
  expect(await scan.correct('Riso', 180)).toEqual(item);
  const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
  expect(JSON.parse(String(options.body))).toEqual({ food: { name: 'Riso', grams: 180 } });
  expect(images.photoDataUrl).not.toHaveBeenCalled();
  fetchMock.mockResolvedValue(reply({ kind: 'none', dish: '', items: [], status: status() }));
  expect(await scan.correct('Sasso', 100)).toBeNull();
});
