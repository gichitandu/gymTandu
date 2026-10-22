import '@angular/compiler';
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { createEnvironmentInjector, EnvironmentInjector, runInInjectionContext, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NutritionComponent } from '../src/app/features/nutrition.component';
import { FormDraftService } from '../src/app/services/form-drafts';
import { LocalAiService } from '../src/app/services/local-ai';
import { Store } from '../src/app/services/store';
import { seed } from '../src/app/core/seed';
import { DataSet } from '../src/app/models/domain';
import * as images from '../src/app/services/images';

let service: FormDraftService, database: string;
let data: ReturnType<typeof signal<DataSet>>;
const mounted: { component: NutritionComponent; injector: EnvironmentInjector }[] = [];
const ai = { cancel: vi.fn(), run: vi.fn().mockResolvedValue([]), busy: signal(false) };
beforeEach(() => {
  database = 'nutrition-draft-' + crypto.randomUUID(); service = new FormDraftService(database); data = signal(seed());
  vi.stubGlobal('window', { scrollTo: vi.fn() }); vi.stubGlobal('confirm', vi.fn().mockReturnValue(true));
  ai.cancel.mockClear(); ai.run.mockClear();
});
afterEach(async () => {
  for (const mountedForm of mounted.splice(0)) { mountedForm.component.ngOnDestroy(); mountedForm.injector.destroy(); }
  await service.flushAll(); service.ngOnDestroy(); await service.flushAll(); (service as any).db.close();
  vi.restoreAllMocks(); vi.unstubAllGlobals(); await Dexie.delete(database);
});
async function mount() {
  const store = { data, ready: signal(true), busy: signal(false), archiveKey: () => 'account-a', change: vi.fn(async (fn: (draft: DataSet) => void) => {
    const next = structuredClone(data()); fn(next); data.set(next); return true;
  }) };
  const injector = createEnvironmentInjector([
    { provide: Store, useValue: store }, { provide: LocalAiService, useValue: ai }, { provide: FormDraftService, useValue: service },
    { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: () => null } } } },
  ], null as unknown as EnvironmentInjector);
  const component = runInInjectionContext(injector, () => new NutritionComponent()); component.ngOnInit();
  await (component as any).draftSession.ready; mounted.push({ component, injector }); return { component, store };
}

it('restores an unfinished meal, ingredients, entered amounts and photo after leaving the route without rerunning AI', async () => {
  const { component: first } = await mount(); first.openNew(); first.name = 'Riso con pollo'; first.notes = 'Da confermare';
  first.calories = 420; first.grams = 300; first.photo = new Blob(['photo'], { type: 'image/jpeg' });
  first.ingredients = [{ id: 'ingredient', name: 'Riso', grams: 100, calories: 130, protein: 3, carbs: 28, fat: .3 }];
  first.composedName = 'Pranzo'; first.draftChanged(); first.ngOnDestroy();
  const { component: restored } = await mount();
  expect(restored.showForm()).toBe(true); expect(restored.recoveredDraft()).toBe(true);
  expect(restored.name).toBe('Riso con pollo'); expect(restored.calories).toBe(420); expect(restored.grams).toBe(300);
  expect(restored.ingredients[0].name).toBe('Riso'); expect(restored.composedName).toBe('Pranzo'); expect(await restored.photo?.text()).toBe('photo');
  expect(ai.run).not.toHaveBeenCalled(); expect(data().meals).toEqual([]);
});

it('asks before explicit discard, keeps a refused draft and removes a confirmed discard durably', async () => {
  const { component } = await mount(); component.openNew(); component.name = 'Bozza'; component.draftChanged();
  vi.mocked(confirm).mockReturnValue(false); await component.closeForm(); expect(component.showForm()).toBe(true); expect(component.name).toBe('Bozza');
  vi.mocked(confirm).mockReturnValue(true); await component.closeForm(); expect(component.showForm()).toBe(false);
  await service.flushAll(); const { component: reopened } = await mount(); expect(reopened.showForm()).toBe(false);
});

it('clears only the accepted meal draft after save so reopening does not replay an already registered meal', async () => {
  const { component } = await mount(); component.openNew(); component.name = 'Pasto'; component.calories = 200; component.draftChanged();
  await service.flushAll(); await component.save(); await service.flushAll();
  expect(data().meals).toHaveLength(1); const { component: reopened } = await mount(); expect(reopened.showForm()).toBe(false);
  expect(await service.read('account-a', 'nutrition')).toBeNull();
});

it('preserves an in-flight photo selection for explicit recovery while blocking a deliberate exit during compression', async () => {
  let finish!: (photo: Blob) => void;
  vi.spyOn(images, 'compressPhoto').mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const { component } = await mount(); component.openNew(); component.name = 'Pasto con foto';
  const original = new Blob(['original'], { type: 'image/jpeg' });
  const selecting = component.takePhoto({ target: { files: [original], value: 'image.jpg' } } as unknown as Event);
  expect(await component.canLeave()).toBe(false); expect(component.error()).toContain('Attendi');
  component.ngOnDestroy(); const { component: restored } = await mount();
  expect(restored.name).toBe('Pasto con foto'); expect(await restored.pendingPhoto?.text()).toBe('original'); expect(restored.photoBusy()).toBe(false);
  expect(ai.run).not.toHaveBeenCalled(); finish(new Blob(['compressed'])); await selecting;
  expect(await restored.pendingPhoto?.text()).toBe('original');
});
