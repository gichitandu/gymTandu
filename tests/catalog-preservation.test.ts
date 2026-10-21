import '@angular/compiler';
import { createEnvironmentInjector, EnvironmentInjector, signal } from '@angular/core';
import { afterEach, expect, it, vi } from 'vitest';
import { seed } from '../src/app/core/seed';
import { mergeCatalog, exerciseFingerprint } from '../src/app/services/catalog-merge';
import { exportBackup, importBackup } from '../src/app/services/backup';
import { Store } from '../src/app/services/store';
import { AuthService } from '../src/app/services/auth';
import { GYM_REPOSITORY } from '../src/app/repositories/repository';
import { validateIntegrity } from '../src/app/services/integrity';
import { DataSet } from '../src/app/models/domain';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const catalog = () => { const value = seed(); return { exercises: value.exercises, muscleGroups: value.muscleGroups }; };

it('retains preexisting personal catalog edits and active local-only exercises on the first online refresh', async () => {
  const local = seed(), remote = catalog();
  local.exercises[0].name = 'Panca personale';
  local.exercises.push({ ...local.exercises[1], id: 'custom-local', name: 'Variante personale', active: true });
  remote.exercises[1].name = 'Nuova descrizione condivisa';
  const next = await mergeCatalog(local, remote);
  expect(next.exercises.find(e => e.id === 'exercise-0')?.name).toBe('Panca personale');
  expect(next.exercises.find(e => e.id === 'custom-local')?.active).toBe(true);
  expect(next.exercises.find(e => e.id === 'exercise-1')?.name).toBe('Nuova descrizione condivisa');
  expect(local.settings[0].catalogBaseline).toBeUndefined();
});

it('receives later shared changes when unchanged locally and preserves personal changes over multiple refreshes', async () => {
  let local = await mergeCatalog(seed(), catalog());
  const remote = catalog();remote.exercises[0].name = 'Aggiornamento condiviso';
  local = await mergeCatalog(local, remote);
  expect(local.exercises[0].name).toBe('Aggiornamento condiviso');
  local.exercises[0].name = 'La mia panca';remote.exercises[0].name = 'Altro aggiornamento condiviso';
  local = await mergeCatalog(local, remote);
  local = await mergeCatalog(local, remote);
  expect(local.exercises[0].name).toBe('La mia panca');
  expect(local.settings[0].catalogBaseline?.exercises['exercise-0']).toBe(await exerciseFingerprint(remote.exercises[0]));
});

it('compares actual photo content so equally sized personal images cannot be overwritten', async () => {
  const remote = catalog();remote.exercises[0].image = new Blob(['abc'], { type: 'image/jpeg' });
  const local = await mergeCatalog(seed(), remote);
  local.exercises[0].image = new Blob(['xyz'], { type: 'image/jpeg' });
  const next = await mergeCatalog(local, remote);
  expect(await next.exercises[0].image!.text()).toBe('xyz');
});

it('deactivates removed unchanged shared rows while keeping personal additions selectable', async () => {
  const remote = catalog();remote.exercises.push({ ...remote.exercises[0], id: 'shared-variant', name: 'Variante condivisa' });
  const local = await mergeCatalog(seed(), remote);
  local.exercises.push({ ...local.exercises[0], id: 'personal-variant', name: 'Variante locale' });
  remote.exercises = remote.exercises.filter(e => e.id !== 'shared-variant');
  const next = await mergeCatalog(local, remote);
  expect(next.exercises.find(e => e.id === 'shared-variant')?.active).toBe(false);
  expect(next.exercises.find(e => e.id === 'personal-variant')?.active).toBe(true);
});

it('accepts an explicitly saved shared edit without losing unrelated local group and exercise changes', async () => {
  const local = await mergeCatalog(seed(), catalog()), remote = catalog();
  local.exercises[0].name = 'Prima modifica personale';local.exercises[1].name = 'Da conservare';
  local.muscleGroups[0].name = 'Il mio petto';
  remote.exercises[0].name = 'Modifica appena salvata';remote.muscleGroups[1].name = 'Dorso';
  const next = await mergeCatalog(local, remote, { exercises: ['exercise-0'] });
  expect(next.exercises[0].name).toBe('Modifica appena salvata');
  expect(next.exercises[1].name).toBe('Da conservare');
  expect(next.muscleGroups[0].name).toBe('Il mio petto');expect(next.muscleGroups[1].name).toBe('Dorso');
  const restored = await importBackup(await exportBackup(next));
  expect(restored.settings[0].catalogBaseline).toEqual(next.settings[0].catalogBaseline);
});

function storeFixture(offline = false, role = 'SuperAdmin') {
  vi.stubGlobal('document', { body: { classList: { toggle: () => {} } } });
  vi.stubGlobal('navigator', { onLine: false });
  let persisted = seed();
  const remote = catalog();
  const request = vi.fn(async (path: string, body?: any) => {
    if (path === 'catalog/exercise') {
      const { imageData: _imageData, ...exercise } = body;
      const index = remote.exercises.findIndex(e => e.id === exercise.id);
      if (index < 0) remote.exercises.push(exercise);else remote.exercises[index] = exercise;
    }
    return structuredClone(remote);
  });
  const auth = { user: signal({ id: 'owner', owner: true, role }), offlineMode: () => offline, request };
  const injector = createEnvironmentInjector([
    { provide: AuthService, useValue: auth },
    { provide: GYM_REPOSITORY, useValue: { read: async () => structuredClone(persisted), replace: async (data: DataSet) => { validateIntegrity(data);persisted = structuredClone(data); } } },
    Store,
  ], null as unknown as EnvironmentInjector);
  return { injector, store: injector.get(Store), request, saved: () => persisted };
}

it('permits local-mode personal catalog additions and keeps restored exercise edits active', async () => {
  const t = storeFixture(true, 'User');
  try {
    await vi.waitFor(() => expect(t.store.ready()).toBe(true));
    expect(t.store.canEditCatalog()).toBe(true);
    await t.store.saveExercise({ ...t.store.data().exercises[0], id: 'my-exercise', name: 'Esercizio personale' });
    await t.store.saveMuscleGroup('my-group', 'Gruppo personale');
    expect(t.saved().exercises.find(e => e.id === 'my-exercise')?.active).toBe(true);
    expect(t.saved().muscleGroups.find(g => g.id === 'my-group')?.name).toBe('Gruppo personale');
    expect(t.request).not.toHaveBeenCalled();
    const recovered = seed();recovered.exercises[0].name = 'Nome recuperato';
    recovered.exercises.push({ ...recovered.exercises[0], id: 'recovered', name: 'Esercizio recuperato' });
    expect(await t.store.change(data => Object.assign(data, recovered), '', false)).toBe(true);
    expect(t.saved().exercises[0].name).toBe('Nome recuperato');
    expect(t.saved().exercises.find(e => e.id === 'recovered')?.active).toBe(true);
  } finally { await t.store.settled();t.injector.destroy(); }
});

it('shows the accepted online edit immediately rather than restoring the old personal copy', async () => {
  const t = storeFixture();
  try {
    await vi.waitFor(() => expect(t.store.ready()).toBe(true));
    await t.store.change(data => { data.exercises[0].name = 'Vecchia modifica'; }, '', false);
    expect(await t.store.saveExercise({ ...t.store.data().exercises[0], name: 'Nuovo nome salvato' })).toBe(true);
    expect(t.saved().exercises[0].name).toBe('Nuovo nome salvato');
    await t.store.refreshCatalog();expect(t.saved().exercises[0].name).toBe('Nuovo nome salvato');
  } finally { await t.store.settled();t.injector.destroy(); }
});
