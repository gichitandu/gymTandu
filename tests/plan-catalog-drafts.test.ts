import '@angular/compiler';
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { createEnvironmentInjector, EnvironmentInjector, runInInjectionContext } from '@angular/core';
import { FormBuilder } from '@angular/forms';
import { Router } from '@angular/router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PlansComponent } from '../src/app/features/plans.component';
import { CatalogComponent } from '../src/app/features/catalog.component';
import { FormDraftService } from '../src/app/services/form-drafts';
import { Store } from '../src/app/services/store';
import { seed } from '../src/app/core/seed';
import { now } from '../src/app/models/domain';
import * as images from '../src/app/services/images';

let data: ReturnType<typeof seed>, drafts: FormDraftService, injector: EnvironmentInjector, name: string;
let store: ReturnType<typeof makeStore>;
const live = new Set<PlansComponent | CatalogComponent>();
function makeStore() {
  return {
    data: () => data, settings: () => data.settings[0], archiveKey: () => 'account-one', ready: () => true,
    canEditCatalog: () => true, sharedCatalog: () => false,
    exercise: (id: string) => data.exercises.find(item => item.id === id),
    planExercises: (day: string) => data.planExercises.filter(item => item.dayId === day),
    weight: (value: number) => value, kg: (value: number) => value,
    error: { set: vi.fn() },
    savePlan: vi.fn(async (id: string, title: string, description: string) => {
      const existing = data.plans.find(item => item.id === id);
      if (existing) Object.assign(existing, { name: title, description });
      else data.plans.push({ id, userId: 'local', name: title, description, active: true, archived: false, createdAt: now(), updatedAt: now() });
      return true;
    }),
    saveMuscleGroup: vi.fn(async (id: string, title: string) => {
      const existing = data.muscleGroups.find(item => item.id === id);
      if (existing) existing.name = title; else data.muscleGroups.push({ id, name: title });
      return true;
    }),
    saveExercise: vi.fn(async (value: typeof data.exercises[number]) => {
      const index = data.exercises.findIndex(item => item.id === value.id);
      if (index < 0) data.exercises.push(value); else data.exercises[index] = value;
      return true;
    }),
    change: vi.fn(async (update: (draft: typeof data) => void) => { update(data); return true; }),
  };
}
function create<T extends PlansComponent | CatalogComponent>(constructor: new () => T) {
  const component = runInInjectionContext(injector, () => new constructor());
  live.add(component); component.ngOnInit(); return component;
}
async function leave(component: PlansComponent | CatalogComponent) { component.ngOnDestroy(); live.delete(component); await drafts.flushAll(); }
beforeEach(() => {
  vi.stubGlobal('confirm', () => true);
  data = seed(); name = 'plan-catalog-drafts-' + crypto.randomUUID(); drafts = new FormDraftService(name); store = makeStore();
  injector = createEnvironmentInjector([
    FormBuilder, { provide: Store, useValue: store }, { provide: Router, useValue: {} }, { provide: FormDraftService, useValue: drafts },
  ], null as unknown as EnvironmentInjector);
});
afterEach(async () => {
  for (const component of live) component.ngOnDestroy(); live.clear();
  await drafts.flushAll(); injector.destroy(); await Promise.resolve(); await new Dexie(name).delete();
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});

it('recovers an unsaved plan on return and never recreates its draft after a successful save', async () => {
  const first = create(PlansComponent); await drafts.flushAll();
  first.openPlan(); first.planForm.patchValue({ name: 'La mia scheda', description: 'Quattro giorni' });
  await leave(first);
  const restored = create(PlansComponent);
  await vi.waitFor(() => expect(restored.modal()).toBe('plan'));
  expect(restored.planForm.getRawValue()).toEqual({ name: 'La mia scheda', description: 'Quattro giorni' });
  expect(restored.draftNotice()).toContain('Bozza recuperata');
  await restored.savePlan(); await leave(restored);
  expect(data.plans.filter(plan => plan.name === 'La mia scheda')).toHaveLength(1);
  const next = create(PlansComponent); await drafts.flushAll();
  expect(next.modal()).toBe(''); expect(await drafts.read('account-one', 'plans-editor')).toBeNull();
});

it('recovers all exercise-plan fields and rejects a draft whose day was removed', async () => {
  data.plans.push({ id: 'plan', userId: 'local', name: 'Scheda', description: '', active: true, archived: false, createdAt: now(), updatedAt: now() });
  data.days.push({ id: 'day', planId: 'plan', name: 'Giorno', order: 0 });
  const first = create(PlansComponent); await drafts.flushAll();
  first.openExercise('day'); first.exerciseForm.patchValue({ exerciseId: 'exercise-0', sets: 4, repsMin: 6, repsMax: 8, targetWeight: 42.5, rpe: 8, warmupSets: 2, superset: 'B', notes: 'Presa stretta' });
  first.exerciseSearch.set('panca'); first.scope.set('favorites'); await leave(first);
  const restored = create(PlansComponent);
  await vi.waitFor(() => expect(restored.modal()).toBe('exercise'));
  expect(restored.parentId).toBe('day'); expect(restored.exerciseSearch()).toBe('panca'); expect(restored.scope()).toBe('favorites');
  expect(restored.exerciseForm.getRawValue()).toMatchObject({ sets: 4, targetWeight: 42.5, rpe: 8, warmupSets: 2, superset: 'B', notes: 'Presa stretta' });
  await leave(restored); data.days = [];
  const stale = create(PlansComponent); await drafts.flushAll();
  expect(stale.modal()).toBe(''); expect(stale.draftNotice()).toContain('non più disponibile');
  expect(data.planExercises).toEqual([]);
});

it('keeps plan edits open when discard is refused and requires confirmation before removing an exercise', async () => {
  const component = create(PlansComponent); await drafts.flushAll();
  component.openPlan(); component.planForm.patchValue({ name: 'Modifiche da conservare' });
  vi.stubGlobal('confirm', () => false); await component.closeModal(); component.openDay('other');
  expect(component.modal()).toBe('plan'); expect(component.planForm.controls.name.value).toBe('Modifiche da conservare');
  const item = { id: 'entry', dayId: 'day', exerciseId: 'exercise-0', sets: 3, repsMin: 8, repsMax: 12, rest: 90, notes: '', order: 0 };
  data.planExercises.push(item); await component.removeExercise(item);
  expect(store.change).not.toHaveBeenCalled(); expect(data.planExercises).toHaveLength(1);
  vi.stubGlobal('confirm', () => true); await component.removeExercise(item);
  expect(data.planExercises).toHaveLength(0);
});

it('recovers an exercise name and selected photo without saving it into the catalog automatically', async () => {
  const photo = new Blob(['compressed photo'], { type: 'image/jpeg' });
  vi.spyOn(images, 'compressPhoto').mockResolvedValue(photo);
  const first = create(CatalogComponent); await drafts.flushAll(); first.open();
  first.form.patchValue({ name: 'Variante personale', equipment: 'Manubri', tags: 'casa, breve' });
  await first.image({ target: { files: [new Blob(['original'], { type: 'image/jpeg' })], value: 'photo.jpg' } } as unknown as Event);
  await leave(first);
  const restored = create(CatalogComponent);
  await vi.waitFor(() => expect(restored.editing()).toBe(true));
  expect(restored.form.getRawValue()).toMatchObject({ name: 'Variante personale', tags: 'casa, breve' });
  expect(await restored.imageBlob!.text()).toBe('compressed photo'); expect(store.saveExercise).not.toHaveBeenCalled();
  await restored.save(); await leave(restored);
  expect(data.exercises.filter(item => item.name === 'Variante personale')).toHaveLength(1);
  expect(await drafts.read('account-one', 'catalog-editor')).toBeNull();
});

it('retains the group name and identifier across navigation and a failed save', async () => {
  const first = create(CatalogComponent); await drafts.flushAll(); first.newGroup(); first.groupName = 'Mobilità'; first.draftChanged(); await leave(first);
  const restored = create(CatalogComponent);
  await vi.waitFor(() => expect(restored.groupEditing()).toBe(true));
  expect(restored.groupName).toBe('Mobilità');
  store.saveMuscleGroup.mockResolvedValueOnce(false); await restored.saveGroup();
  expect(restored.groupEditing()).toBe(true); expect(restored.groupName).toBe('Mobilità');
  await restored.saveGroup(); expect(restored.groupEditing()).toBe(false);
  expect(store.saveMuscleGroup.mock.calls[0][0]).toBe(store.saveMuscleGroup.mock.calls[1][0]);
});

it('keeps a catalog modal and photo when a backdrop discard is refused', async () => {
  const component = create(CatalogComponent); await drafts.flushAll(); component.open(); component.form.patchValue({ name: 'Da finire' });
  vi.stubGlobal('confirm', () => false); const backdrop = {};
  component.close({ target: backdrop, currentTarget: backdrop } as unknown as MouseEvent);
  expect(component.editing()).toBe(true); expect(component.form.controls.name.value).toBe('Da finire');
  vi.stubGlobal('confirm', () => true); component.dismiss(); await drafts.flushAll();
  expect(component.editing()).toBe(false); expect(await drafts.read('account-one', 'catalog-editor')).toBeNull();
});

it('drops a plan draft already committed while away but preserves newer values for an existing saved identifier', async () => {
  const first = create(PlansComponent); await drafts.flushAll(); first.openPlan(); first.planForm.patchValue({ name: 'Valori aggiornati' }); await leave(first);
  const snapshot = await drafts.read<any>('account-one', 'plans-editor');
  await store.savePlan(snapshot.saveId, 'Valori aggiornati', '');
  const saved = create(PlansComponent); await drafts.flushAll();
  expect(saved.modal()).toBe(''); expect(await drafts.read('account-one', 'plans-editor')).toBeNull(); await leave(saved);
  await drafts.write('account-one', 'plans-editor', { ...snapshot, plan: { ...snapshot.plan, name: 'Modifiche successive' } });
  const newer = create(PlansComponent);
  await vi.waitFor(() => expect(newer.modal()).toBe('plan'));
  expect(newer.planForm.controls.name.value).toBe('Modifiche successive'); expect(newer.editId).toBe(snapshot.saveId);
});

it('converts an exercise target when the weight unit changed while its form was left as a draft', async () => {
  data.plans.push({ id: 'plan', userId: 'local', name: 'Scheda', description: '', active: true, archived: false, createdAt: now(), updatedAt: now() });
  data.days.push({ id: 'day', planId: 'plan', name: 'Giorno', order: 0 }); data.settings[0].unit = 'lb';
  const first = create(PlansComponent); await drafts.flushAll(); first.openExercise('day'); first.exerciseForm.patchValue({ exerciseId: 'exercise-0', targetWeight: 44.092452436 }); await leave(first);
  data.settings[0].unit = 'kg'; const restored = create(PlansComponent);
  await vi.waitFor(() => expect(restored.modal()).toBe('exercise'));
  expect(restored.exerciseForm.controls.targetWeight.value).toBeCloseTo(20);
});

it('compares catalog photo bytes before treating a saved identifier as an already committed draft', async () => {
  const first = create(CatalogComponent); await drafts.flushAll(); first.open(); first.form.patchValue({ name: 'Foto personale', equipment: 'Cavi' }); first.imageBlob = new Blob(['aaaa'], { type: 'image/jpeg' }); await leave(first);
  const snapshot = await drafts.read<any>('account-one', 'catalog-editor'), value = snapshot.value;
  await store.saveExercise({ ...data.exercises[0], ...value, id: snapshot.saveId, tags: [], image: new Blob(['bbbb'], { type: 'image/jpeg' }), createdAt: now() });
  const restored = create(CatalogComponent);
  await vi.waitFor(() => expect(restored.editing()).toBe(true));
  expect(await restored.imageBlob!.text()).toBe('aaaa'); expect(restored.editId).toBe(snapshot.saveId);
});
