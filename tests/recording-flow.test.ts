import '@angular/compiler';
import 'fake-indexeddb/auto';
import { createEnvironmentInjector, EnvironmentInjector, runInInjectionContext } from '@angular/core';
import { FormBuilder } from '@angular/forms';
import { Router } from '@angular/router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GymDatabase } from '../src/app/core/database';
import { GYM_REPOSITORY } from '../src/app/repositories/repository';
import { Store } from '../src/app/services/store';
import { PlansComponent } from '../src/app/features/plans.component';
import { ActiveWorkoutComponent } from '../src/app/shared/active-workout.component';
import { SessionComponent } from '../src/app/features/session.component';
import { FormDraftService } from '../src/app/services/form-drafts';
import Dexie from 'dexie';

let db: GymDatabase, injector: EnvironmentInjector, s: Store;
let active: ActiveWorkoutComponent | undefined;
let formDrafts:FormDraftService,draftName:string;
beforeEach(async () => {
  vi.stubGlobal('document', { body: { classList: { toggle: () => {} } } });
  db = new GymDatabase('recording-flow-' + crypto.randomUUID());
  draftName='recording-form-drafts-'+crypto.randomUUID();formDrafts=new FormDraftService(draftName);
  injector = createEnvironmentInjector([
    { provide: GYM_REPOSITORY, useValue: { read: () => db.snapshot(), replace: (data: any) => db.replace(data) } },
    { provide: Router, useValue: { navigateByUrl: vi.fn(async () => true) } },{provide:FormDraftService,useValue:formDrafts}, FormBuilder, Store,
  ], null as unknown as EnvironmentInjector);
  s = injector.get(Store);
  await vi.waitFor(() => expect(s.ready()).toBe(true));
});
afterEach(async () => {
  active?.ngOnDestroy(); active = undefined;
  await s.settled();
  await formDrafts.flushAll();formDrafts.ngOnDestroy();await formDrafts.flushAll();(formDrafts as any).db.close();await Dexie.delete(draftName);
  injector.destroy(); await db.delete(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});
async function setup() {
  await s.savePlan('p', 'Piano', ''); await s.saveDay('d', 'p', 'Giorno');
  await s.savePlanExercise({ id: 'pe', dayId: 'd', exerciseId: 'exercise-0', sets: 3, repsMin: 8, repsMax: 10, rest: 90, notes: '', order: 0 });
  await s.start('d');
  active = runInInjectionContext(injector, () => new ActiveWorkoutComponent());
  const id = s.draft()!.id;
  Object.defineProperty(active, 'workoutId', { value: () => id });
  return active;
}
it('salva un solo esercizio anche con invii concorrenti e un invio tardivo dello stesso modulo', async () => {
  await s.savePlan('p', 'Piano', ''); await s.saveDay('d', 'p', 'Giorno');
  const component = runInInjectionContext(injector, () => new PlansComponent());
  component.openExercise('d');
  component.exerciseForm.patchValue({ exerciseId: 'exercise-0' });
  await Promise.all([component.saveExercise(), component.saveExercise(), component.saveExercise()]);
  await component.saveExercise();
  const entries = (await db.snapshot()).planExercises;
  expect(entries).toHaveLength(1); expect(entries[0].order).toBe(0);
  expect(component.saving()).toBe(false);
  component.openExercise('d'); component.exerciseForm.patchValue({ exerciseId: 'exercise-4' });
  await component.saveExercise();
  expect((await db.snapshot()).planExercises).toHaveLength(2);
});
it('riabilita Salva dopo un errore e riutilizza lo stesso identificativo al nuovo tentativo', async () => {
  await s.savePlan('p', 'Piano', ''); await s.saveDay('d', 'p', 'Giorno');
  const component = runInInjectionContext(injector, () => new PlansComponent());
  component.openExercise('d'); component.exerciseForm.patchValue({ exerciseId: 'exercise-0' });
  const save = vi.spyOn(s, 'savePlanExercise').mockRejectedValueOnce(new Error('Archivio occupato'));
  await expect(component.saveExercise()).rejects.toThrow('Archivio occupato');
  expect(component.saving()).toBe(false);
  const attemptedId = save.mock.calls[0][0].id;
  await component.saveExercise();
  expect(s.planExercises('d').map(x => x.id)).toEqual([attemptedId]);
});
it('apre direttamente la prima serie da completare e conserva gli input passando a un’altra serie', async () => {
  const c = await setup(), exercise = c.exercises()[0], sets = s.sets(exercise.id);
  await s.updateSet(sets[0].id, { completed: true, weight: 50, reps: 10 });
  c.quickRecord(exercise);
  expect(c.step()).toBe('record'); expect(c.setId()).toBe(sets[1].id);
  c.useReference(); expect(c.weight).toBe(50); expect(c.reps).toBe(10);
  c.weight = 52.5; c.reps = 9; c.inputChanged();
  c.record(sets[1]);
  expect(c.weight).toBe(52.5); expect(c.reps).toBe(9);
  c.record(sets[2]);
  await s.settled();
  expect(s.sets(exercise.id)[1]).toMatchObject({ weight: 52.5, reps: 9, completed: false });
});
it('ignora Completa ripetuto durante e dopo il salvataggio e raggruppa tocchi concorrenti su Aggiungi serie', async () => {
  const c = await setup(), exercise = c.exercises()[0]; c.quickRecord(exercise);
  await Promise.all([c.complete(), c.complete(), c.complete()]);
  const end = c.restEnd(); await c.complete();
  expect(c.restEnd()).toBe(end); expect(c.completedSets()).toBe(1);
  await Promise.all([s.addSet(exercise.id), s.addSet(exercise.id), s.addSet(exercise.id)]);
  expect(s.sets(exercise.id)).toHaveLength(4);
  await s.addSet(exercise.id); expect(s.sets(exercise.id)).toHaveLength(5);
});
it('attende una nuova cifra durante la digitazione e mostra la validazione solo alla conferma esplicita', async () => {
  const c = await setup();c.quickRecord(c.exercises()[0]);
  const original = c.currentSet()!.weight;
  c.weight = null as unknown as number;
  expect(await c.saveDraft()).toBe(false);
  expect(s.error()).toBe('');
  expect(c.currentSet()!.weight).toBe(original);
  await c.complete();
  expect(s.error()).toBe('Controlla peso e ripetizioni.');
  expect(c.currentSet()!.completed).toBe(false);
  c.weight = 52.5;
  expect(await c.saveDraft()).toBe(true);
  expect(c.currentSet()!.weight).toBe(52.5);
});
it('conserva la navigazione scelta durante un salvataggio senza aprire il recupero della serie sbagliata', async () => {
  const c = await setup(); c.quickRecord(c.exercises()[0]);
  let release!: () => void;
  const delayed = new Promise<void>(resolve => { release = resolve; });
  const update = s.updateSet.bind(s);
  vi.spyOn(s, 'updateSet').mockImplementationOnce(async (id, patch) => {
    await delayed; return update(id, patch);
  });
  const completing = c.complete(); c.navigate('list'); release();
  await completing; await s.settled();
  expect(c.step()).toBe('list'); expect(c.restEnd()).toBe(0);
  expect(c.completedSets()).toBe(1);
});
it('conserva i valori più recenti anche tornando subito alla serie precedente durante una scrittura lenta', async () => {
  const c = await setup(), exercise = c.exercises()[0], sets = s.sets(exercise.id);
  c.quickRecord(exercise);
  let release!: () => void;
  const delayed = new Promise<void>(resolve => { release = resolve; });
  const update = s.updateSet.bind(s);
  vi.spyOn(s, 'updateSet').mockImplementationOnce(async (id, patch) => {
    await delayed; return update(id, patch);
  });
  c.weight = 65; c.reps = 11; c.inputChanged();
  c.record(sets[1]); c.record(sets[0]);
  expect(c.weight).toBe(65); expect(c.reps).toBe(11);
  release(); await delayed; await s.settled();
  expect(await c.flushForFinish()).toBe(true);
  expect(s.sets(exercise.id)[0]).toMatchObject({ weight: 65, reps: 11 });
});
it('non conclude la sessione quando gli ultimi input sono invalidi o non vengono salvati', async () => {
  const c = await setup(), exercise = c.exercises()[0]; c.quickRecord(exercise);
  await s.updateSet(c.setId(), { completed: true });
  const session = runInInjectionContext(injector, () => new SessionComponent());
  Object.defineProperty(session, 'activeWorkout', { value: () => c });
  try {
    c.weight = -5; c.inputChanged(); await session.finish();
    expect(s.draft()).toBeDefined(); expect(session.finishing()).toBe(false);
    c.weight = 55; c.inputChanged();
    vi.spyOn(s, 'updateSet').mockResolvedValueOnce(false);
    await session.finish(); expect(s.draft()).toBeDefined();
    await session.finish(); expect(s.draft()).toBeUndefined();
    expect(s.sets(exercise.id)[0].weight).toBe(55);
  } finally { session.ngOnDestroy(); }
});
it('blocca l’aggiornamento quando la validazione fallisce anche se un salvataggio successivo cancella l’errore globale', async () => {
  const c = await setup(); c.quickRecord(c.exercises()[0]); c.reps = 0;
  const pending: Promise<boolean | void>[] = [];
  c.beforeUpdate({ waitUntil: (save: Promise<boolean | void>) => pending.push(save) } as any);
  await s.change(() => {});
  expect(await Promise.all(pending)).toEqual([false]);
  expect(s.draft()).toBeDefined();
});
it('ignora un secondo tocco ravvicinato su Salva anche se è già visibile la serie successiva', async () => {
  const c = await setup(); c.quickRecord(c.exercises()[0]);
  await c.complete({ timeStamp: 1000 } as MouseEvent); c.advance();
  await c.complete({ timeStamp: 1100 } as MouseEvent);
  expect(c.completedSets()).toBe(1); expect(c.step()).toBe('record');
  await c.complete({ timeStamp: 1700 } as MouseEvent);
  expect(c.completedSets()).toBe(2);
});

it('ritenta tutte le serie rimaste in bozza e riapre il campo non salvato prima di concludere',async()=>{
  const c=await setup(),exercise=c.exercises()[0],sets=s.sets(exercise.id);c.quickRecord(exercise);
  c.weight=72.5;c.reps=9;c.inputChanged();
  const update=s.updateSet.bind(s),fault=vi.spyOn(s,'updateSet').mockImplementation(async(id,patch)=>id===sets[0].id?false:update(id,patch));
  expect(await c.saveDraft()).toBe(false);c.record(sets[1]);c.weight=80;c.reps=8;c.inputChanged();
  expect(await c.flushForFinish()).toBe(false);
  expect(c.setId()).toBe(sets[0].id);expect(c.weight).toBe(72.5);
  expect(s.sets(exercise.id)[1].weight).toBe(80);
  fault.mockRestore();expect(await c.flushForFinish()).toBe(true);
  expect(s.sets(exercise.id)[0]).toMatchObject({weight:72.5,reps:9,completed:false});
});

it('recupera una bozza invalida della serie dopo aver lasciato la schermata e la elimina dopo la correzione',async()=>{
  const c=await setup();c.ngOnInit();await (c as any).draftSession.ready;c.quickRecord(c.exercises()[0]);
  c.weight=null as unknown as number;c.reps=12;c.inputChanged();
  await (c as any).draftSession.flush();const id=c.workoutId(),setId=c.setId();c.ngOnDestroy();await formDrafts.flushAll();
  active=runInInjectionContext(injector,()=>new ActiveWorkoutComponent());Object.defineProperty(active,'workoutId',{value:()=>id});active.ngOnInit();await (active as any).draftSession.ready;
  expect(active.step()).toBe('record');expect(active.setId()).toBe(setId);expect(active.weight).toBeNull();expect(active.reps).toBe(12);
  active.weight=67.5;active.inputChanged();expect(await active.flushForFinish()).toBe(true);await formDrafts.flushAll();
  expect(await formDrafts.read(s.archiveKey(),'active-sets:'+id)).toBeNull();
});

it('non perde il comando Completa se il salvataggio automatico della stessa serie era già in corso',async()=>{
  const c=await setup();c.quickRecord(c.exercises()[0]);c.weight=70;c.reps=10;
  let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;}),update=s.updateSet.bind(s);
  vi.spyOn(s,'updateSet').mockImplementationOnce(async(id,patch)=>{await held;return update(id,patch);});
  const automatic=c.saveDraft();const completing=c.complete();release();await automatic;await completing;
  expect(c.currentSet()).toMatchObject({weight:70,reps:10,completed:true});expect(c.step()).toBe('rest');
});
