import '@angular/compiler';
import 'fake-indexeddb/auto';
import { createEnvironmentInjector, EnvironmentInjector, runInInjectionContext } from '@angular/core';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GymDatabase } from '../src/app/core/database';
import { GYM_REPOSITORY } from '../src/app/repositories/repository';
import { Store } from '../src/app/services/store';
import { WorkoutEditorComponent } from '../src/app/shared/workout-editor.component';

let db: GymDatabase, injector: EnvironmentInjector, store: Store, editor: WorkoutEditorComponent;

beforeEach(async () => {
  vi.stubGlobal('document', { body: { classList: { toggle: () => {} } } });
  db = new GymDatabase('historical-editor-' + crypto.randomUUID());
  injector = createEnvironmentInjector([
    { provide: GYM_REPOSITORY, useValue: { read: () => db.snapshot(), replace: (data: any) => db.replace(data) } }, Store,
  ], null as unknown as EnvironmentInjector);
  store = injector.get(Store);
  await vi.waitFor(() => expect(store.ready()).toBe(true));
  await store.savePlan('plan', 'Piano', '');
  await store.saveDay('day', 'plan', 'Giorno');
  await store.savePlanExercise({ id: 'exercise', dayId: 'day', exerciseId: 'exercise-0', sets: 1, repsMin: 8, repsMax: 12, rest: 90, notes: '', order: 0 });
  await store.start('day');
  const id = store.draft()!.id;
  editor = runInInjectionContext(injector, () => new WorkoutEditorComponent());
  Object.defineProperty(editor, 'workoutId', { value: () => id });
});

afterEach(async () => {
  await editor.flushAll(false);
  editor.ngOnDestroy();
  await store.settled();
  injector.destroy();
  await db.delete();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function exercise() { return store.workoutExercises(editor.workoutId())[0]; }
function set() { return store.sets(exercise().id)[0]; }

it('keeps newly typed values displayed while an older write updates the stored set', async () => {
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const update = store.updateSet.bind(store);
  let displayedDuringOldWrite: number | null | undefined;
  vi.spyOn(store, 'updateSet').mockImplementationOnce(async (id, patch) => {
    await held;
    const saved = await update(id, patch);
    displayedDuringOldWrite = editor.numberValue(set(), 'weight');
    return saved;
  });
  editor.patchNumber(set(), 'weight', 60);
  const saving = editor.flushRow(set().id);
  editor.patchNumber(set(), 'weight', 62.5);
  editor.patchNumber(set(), 'reps', 9);
  expect(editor.numberValue(set(), 'weight')).toBe(62.5);
  release();
  expect(await saving).toBe(true);
  expect(displayedDuringOldWrite).toBe(62.5);
  expect(set()).toMatchObject({ weight: 62.5, reps: 9 });
});

it('defers empty-field validation while typing and refuses completion until a valid value is entered', async () => {
  const update = vi.spyOn(store, 'updateSet');
  editor.patchNumber(set(), 'reps', null);
  expect(await editor.flushRow(set().id, false)).toBe(false);
  expect(editor.numberValue(set(), 'reps')).toBeNull();
  expect(store.error()).toBe('');
  expect(update).not.toHaveBeenCalled();
  await editor.toggle(set(), exercise());
  expect(set().completed).toBe(false);
  expect(store.error()).toContain('Valore non valido');
  editor.patchNumber(set(), 'reps', 11);
  await editor.toggle(set(), exercise());
  expect(set()).toMatchObject({ reps: 11, completed: true });
});

it('keeps a failed edit available and aborts completion until the write succeeds', async () => {
  editor.patchNumber(set(), 'weight', 85);
  vi.spyOn(store, 'updateSet').mockImplementationOnce(async () => {
    store.error.set('Spazio locale esaurito');
    return false;
  });
  await editor.toggle(set(), exercise());
  expect(set().completed).toBe(false);
  expect(editor.numberValue(set(), 'weight')).toBe(85);
  expect(editor.toggling().size).toBe(0);
  await editor.toggle(set(), exercise());
  expect(set()).toMatchObject({ weight: 85, completed: true });
});

it('flushes notes and optional fields before app updates and rejects invalid pending inputs', async () => {
  await store.updateSet(set().id, { rpe: 8 });
  editor.patchNotes(set(), 'Nota modificata');
  editor.patchNumber(set(), 'rpe', null);
  const pending: Promise<boolean | void>[] = [];
  const event = Object.assign(new Event('gymtrack:before-update'), { waitUntil: (save: Promise<boolean | void>) => pending.push(save) });
  editor.beforeUpdate(event);
  expect(await Promise.all(pending)).toEqual([true]);
  expect(set().notes).toBe('Nota modificata');
  expect(set().rpe).toBeUndefined();
  editor.patchNumber(set(), 'reps', null);
  pending.length = 0;
  editor.beforeUpdate(event);
  expect(await Promise.all(pending)).toEqual([false]);
  editor.patchNumber(set(), 'reps', 8);
});

it('saves the latest pending input when the historical editor is closed without waiting for its debounce', async () => {
  editor.patchNotes(set(), 'Da conservare alla chiusura');
  editor.patchNumber(set(), 'rest', 0);
  editor.ngOnDestroy();
  await store.settled();
  expect(set()).toMatchObject({ notes: 'Da conservare alla chiusura', rest: 0 });
});

it('requires confirmation before replacing existing historical series',async()=>{
  vi.stubGlobal('confirm',vi.fn(()=>false));const copy=vi.spyOn(store,'copyPrevious');
  editor.patchNumber(set(),'weight',72.5);await editor.copyPrevious(exercise().id);
  expect(confirm).toHaveBeenCalledOnce();expect(copy).not.toHaveBeenCalled();
  expect(editor.numberValue(set(),'weight')).toBe(72.5);
});

it('preserves completion and skipped flags when values are copied into a completed workout',async()=>{
  const historicalExercise=exercise(),historicalWorkout=editor.workoutId();
  await store.updateSet(set().id,{weight:60,reps:10,completed:true});
  await store.addSet(historicalExercise.id);await store.finish();await store.start('day');
  const reference=store.workoutExercises(store.draft()!.id)[0];
  await store.updateSet(store.sets(reference.id)[0].id,{weight:80,reps:8,completed:true});
  await store.addSet(reference.id);await store.updateSet(store.sets(reference.id)[1].id,{weight:85,reps:6,completed:true});await store.finish();
  vi.stubGlobal('confirm',vi.fn(()=>true));await editor.copyPrevious(historicalExercise.id);
  expect(store.data().workouts.find(workout=>workout.id===historicalWorkout)?.status).toBe('completed');
  expect(store.sets(historicalExercise.id).map(row=>({weight:row.weight,completed:row.completed}))).toEqual([{weight:80,completed:true},{weight:85,completed:false}]);
});
