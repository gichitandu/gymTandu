import '@angular/compiler';
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, expect, it, vi } from 'vitest';
import { FormDraftService, validateFormDraft } from '../src/app/services/form-drafts';

const services: FormDraftService[] = [], names: string[] = [];
function service(name = 'draft-test-' + crypto.randomUUID()) { names.push(name); const value = new FormDraftService(name); services.push(value); return value; }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
afterEach(async () => {
  vi.restoreAllMocks();
  for (const entry of services.splice(0)) { await entry.flushAll(); entry.ngOnDestroy(); await entry.flushAll(); (entry as any).db.close(); }
  for (const name of new Set(names.splice(0))) await Dexie.delete(name);
});

it('recovers a form with its photo and incomplete values in the same archive while isolating other accounts', async () => {
  const first = service(), photo = new Blob(['jpeg'], { type: 'image/jpeg' });
  const draft = { id: 'meal-id', name: 'Pasto', grams: null, photo, ingredients: [{ name: 'Riso', grams: 120 }] };
  expect(await first.write('account-a', 'nutrition', draft)).toBe(true);
  expect(await first.read('account-b', 'nutrition')).toBeNull();
  const next = service(names[0]);
  let restored: typeof draft | undefined;
  const session = next.bind('account-a', 'nutrition', () => null, value => { restored = value as typeof draft; });
  await session.ready;
  expect(restored?.id).toBe('meal-id'); expect(restored?.grams).toBeNull();
  expect(await restored?.photo.text()).toBe('jpeg'); expect(restored?.ingredients).toEqual(draft.ingredients);
});

it('retains a failed durable write for retry and reports unsafe exit until it is persisted', async () => {
  const value = service(), table = (value as any).db.drafts;
  const put = vi.spyOn(table, 'put').mockRejectedValueOnce(Object.assign(Error('Spazio esaurito'), { name: 'QuotaExceededError' }));
  expect(await value.write('account-a', 'profile', { name: 'Nome modificato' })).toBe(false);
  expect(value.error()).toContain('Bozza non salvata');
  expect(await value.read('account-a', 'profile')).toEqual({ name: 'Nome modificato' });
  expect(await value.flushAll()).toBe(true); expect(put).toHaveBeenCalledTimes(2); expect(value.error()).toBe('');
  expect(await service(names[0]).read('account-a', 'profile')).toEqual({ name: 'Nome modificato' });
});

it('serializes clearing after a pending write so a saved form cannot reappear on the next opening', async () => {
  const value = service(), table = (value as any).db.drafts, gate = deferred<void>(), put = table.put.bind(table);
  vi.spyOn(table, 'put').mockImplementationOnce(async (record: unknown) => { await gate.promise; return put(record); });
  let draft: { name: string } | null = { name: 'Prima bozza' };
  const session = value.bind('a', 'plan', () => draft, () => {}); await session.ready;
  const writing = session.flush(); await Promise.resolve(); await Promise.resolve();
  draft = null; const clearing = session.clear(); gate.resolve();
  await writing; await clearing; await session.destroy();
  expect(await value.read('a', 'plan')).toBeNull();
});

it('does not overwrite new typing with a late old draft restore and captures the latest state on destroy', async () => {
  const value = service(), read = deferred<{ name: string } | null>();
  vi.spyOn(value, 'read').mockReturnValueOnce(read.promise);
  let draft = { name: 'Nuova modifica' }; const restore = vi.fn();
  const session = value.bind('a', 'catalog', () => draft, restore);
  session.changed(); read.resolve({ name: 'Vecchia bozza' }); await session.ready;
  expect(restore).not.toHaveBeenCalled();
  draft = { name: 'Ultima modifica' }; expect(await session.destroy()).toBe(true);
  expect(await value.read('a', 'catalog')).toEqual(draft);
});

it('flushes every registered form, keeps its state after repeated failures, and rejects excessive snapshots', async () => {
  const value = service(), table = (value as any).db.drafts;
  const first = value.bind('a', 'profile', () => ({ name: 'Profilo' }), () => {});
  const second = value.bind('a', 'nutrition', () => ({ name: 'Pasto' }), () => {});
  await Promise.all([first.ready, second.ready]);
  const put = vi.spyOn(table, 'put').mockRejectedValue(Error('QuotaExceededError'));
  expect(await value.flushAll()).toBe(false); expect(value.error()).toContain('Bozza non salvata');
  put.mockRestore(); expect(await value.flushAll()).toBe(true);
  expect(await value.read('a', 'profile')).toEqual({ name: 'Profilo' }); expect(await value.read('a', 'nutrition')).toEqual({ name: 'Pasto' });
  expect(() => validateFormDraft({ photo: new Blob([new Uint8Array(21 * 1024 * 1024)]) })).toThrow('Immagine');
});

it('keeps newer route edits when an older component finishes saving and clears its own draft late', async () => {
  const value = service();
  const old = value.bind('a', 'plan', () => ({ name: 'Vecchio piano' }), () => {}); await old.ready;
  old.changed();
  let draft = { name: 'Nuovo piano' };
  const current = value.bind('a', 'plan', () => draft, saved => { draft = saved; }); await current.ready;
  draft = { name: 'Modifica più recente' }; current.changed();
  await old.clear(); await old.destroy();
  expect(await current.flush()).toBe(true);
  expect(await value.read('a', 'plan')).toEqual({ name: 'Modifica più recente' });
});
