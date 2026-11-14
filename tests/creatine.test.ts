import '@angular/compiler';
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { createEnvironmentInjector, EnvironmentInjector } from '@angular/core';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GymDatabase } from '../src/app/core/database';
import { seed } from '../src/app/core/seed';
import { CreatineLog, TABLES, uid } from '../src/app/models/domain';
import { GYM_REPOSITORY } from '../src/app/repositories/repository';
import { archiveHasContent } from '../src/app/services/archive-sync';
import { exportBackup, importBackup, validateIntegrity } from '../src/app/services/backup';
import { formatGrams } from '../src/app/services/creatine';
import { Store } from '../src/app/services/store';

const databases: Dexie[] = [];
let injector: EnvironmentInjector, s: Store, db: GymDatabase;
beforeEach(async () => {
  vi.stubGlobal('document', { body: { classList: { toggle: () => {} } } });
  db = new GymDatabase('creatine-' + uid());
  injector = createEnvironmentInjector(
    [{ provide: GYM_REPOSITORY, useValue: { read: () => db.snapshot(), replace: (d: any) => db.replace(d) } }, Store],
    null as unknown as EnvironmentInjector,
  );
  s = injector.get(Store);
  await vi.waitFor(() => expect(s.ready()).toBe(true));
});
afterEach(async () => {
  injector.destroy();
  await db.delete();
  for (const d of databases.splice(0)) await d.delete();
  vi.unstubAllGlobals();
});
const day = '2026-11-13';
const log: CreatineLog = { id: 'creatine-' + day, date: day, grams: 5 };

it('somma le dosi del giorno con un solo record per data, anche con tocchi ravvicinati', async () => {
  const results = await Promise.all([s.addCreatine(day, 3), s.addCreatine(day, 5), s.addCreatine(day, 0.5)]);
  expect(results).toEqual([true, true, true]);
  expect(s.data().creatineLogs).toEqual([{ id: 'creatine-' + day, date: day, grams: 8.5 }]);
  expect(await s.addCreatine('2026-11-14', 5)).toBe(true);
  expect(s.data().creatineLogs.map(r => [r.date, r.grams])).toEqual([[day, 8.5], ['2026-11-14', 5]]);
  await s.init();
  expect(s.data().creatineLogs).toHaveLength(2);
});
it('imposta o azzera il totale e rifiuta valori non validi senza toccare l’archivio', async () => {
  await s.setCreatine(day, 5);
  expect(await s.setCreatine(day, 4.5)).toBe(true);
  expect(s.data().creatineLogs[0].grams).toBe(4.5);
  for (const bad of [-1, 101, NaN, Infinity]) {
    expect(await s.setCreatine(day, bad)).toBe(false);
    expect(s.error()).toContain('creatina');
  }
  expect(await s.addCreatine(day, -10)).toBe(false);
  expect(await s.addCreatine(day, 100)).toBe(false);
  expect(s.data().creatineLogs[0].grams).toBe(4.5);
  expect(await s.setCreatine(day, 0)).toBe(true);
  expect(s.data().creatineLogs).toEqual([]);
});
it('formatta i grammi con la virgola', () => {
  expect([formatGrams(0), formatGrams(5), formatGrams(2.5), formatGrams(0.1 + 0.2)]).toEqual(['0', '5', '2,5', '0,3']);
});
it('passa dal backup e accetta un archivio v11 senza creatina', async () => {
  const data = seed();
  data.creatineLogs.push(log);
  const backup = await exportBackup(data), restored = await importBackup(backup);
  expect(restored.creatineLogs).toEqual([log]);
  const old = JSON.parse(backup);
  old.schemaVersion = 11;
  delete old.data.creatineLogs;
  const migrated = await importBackup(JSON.stringify(old));
  expect(migrated.creatineLogs).toEqual([]);
  expect(migrated.exercises).toHaveLength(data.exercises.length);
  expect(archiveHasContent(seed())).toBe(false);
  expect(archiveHasContent(data)).toBe(true);
});
it('aggiorna un archivio senza la tabella in modo additivo e lo tiene separato per account', async () => {
  const name = 'creatine-upgrade-' + uid(), old = new Dexie(name);
  databases.push(old);
  old.version(8).stores({ ...Object.fromEntries(TABLES.filter(t => t !== 'creatineLogs').map(t => [t, 'id'])), wellnessLogs: 'id,&date', archiveMeta: 'id' });
  const data = seed();
  data.profiles[0].name = 'Archivio precedente';
  await old.open();
  for (const table of TABLES.filter(t => t !== 'creatineLogs')) await old.table(table).bulkPut(data[table]);
  old.close();
  const upgraded = new GymDatabase(name);
  databases.push(upgraded);
  const snap = await upgraded.snapshot();
  expect(snap.profiles[0].name).toBe('Archivio precedente');
  expect(snap.creatineLogs).toEqual([]);
  snap.creatineLogs.push(log);
  await upgraded.replace(snap);
  upgraded.close();
  const reopened = new GymDatabase(name);
  databases.push(reopened);
  expect((await reopened.snapshot()).creatineLogs).toEqual([log]);
  const other = new GymDatabase(name + '-other');
  databases.push(other);
  await other.replace(seed());
  expect((await other.snapshot()).creatineLogs).toEqual([]);
});
it('rifiuta date duplicate, date impossibili e grammi fuori intervallo', async () => {
  const data = seed();
  data.creatineLogs.push(log);
  await db.replace(data);
  for (const patch of [{ date: '2026-02-30' }, { grams: 0 }, { grams: -3 }, { grams: 101 }, { grams: NaN }]) {
    const bad = structuredClone(data);
    bad.creatineLogs[0] = { ...log, ...patch };
    expect(() => validateIntegrity(bad)).toThrow();
    await expect(db.replace(bad)).rejects.toThrow();
  }
  const duplicate = structuredClone(data);
  duplicate.creatineLogs.push({ ...log, id: 'other' });
  expect(() => validateIntegrity(duplicate)).toThrow();
  expect((await db.snapshot()).creatineLogs).toEqual([log]);
});
