import '@angular/compiler';
import 'fake-indexeddb/auto';
import { createEnvironmentInjector, EnvironmentInjector, runInInjectionContext } from '@angular/core';
import { FormBuilder } from '@angular/forms';
import { Router } from '@angular/router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Dexie from 'dexie';
import { GymDatabase } from '../src/app/core/database';
import { GYM_REPOSITORY } from '../src/app/repositories/repository';
import { Store } from '../src/app/services/store';
import { FormDraftService } from '../src/app/services/form-drafts';
import { PlansComponent } from '../src/app/features/plans.component';
import { ActiveWorkoutComponent } from '../src/app/shared/active-workout.component';

let db: GymDatabase, injector: EnvironmentInjector, s: Store;
let formDrafts: FormDraftService, draftName: string;
let plans: PlansComponent | undefined, active: ActiveWorkoutComponent | undefined;

beforeEach(async () => {
  vi.stubGlobal('confirm', () => true);
  vi.stubGlobal('document', { body: { classList: { toggle: () => {} } } });
  db = new GymDatabase('plan-editor-coach-' + crypto.randomUUID());
  draftName = 'plan-editor-coach-drafts-' + crypto.randomUUID(); formDrafts = new FormDraftService(draftName);
  injector = createEnvironmentInjector([
    { provide: GYM_REPOSITORY, useValue: { read: () => db.snapshot(), replace: (data: any) => db.replace(data) } },
    { provide: Router, useValue: { navigateByUrl: vi.fn(async () => true) } }, { provide: FormDraftService, useValue: formDrafts }, FormBuilder, Store,
  ], null as unknown as EnvironmentInjector);
  s = injector.get(Store);
  await vi.waitFor(() => expect(s.ready()).toBe(true));
});
afterEach(async () => {
  plans?.ngOnDestroy(); plans = undefined; active?.ngOnDestroy(); active = undefined;
  await s.settled();
  await formDrafts.flushAll(); formDrafts.ngOnDestroy(); await formDrafts.flushAll(); (formDrafts as any).db.close(); await Dexie.delete(draftName);
  injector.destroy(); await db.delete(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});
const createPlans = () => plans = runInInjectionContext(injector, () => new PlansComponent());

it('crea una scheda con la struttura scelta, la apre in modifica e non duplica gli allenamenti', async () => {
  const component = createPlans();
  component.openPlan();
  expect(component.sheetTitle()).toBe('Nuova scheda');
  component.planForm.patchValue({ name: 'Tre giorni' }); component.planTemplate.set('ppl');
  expect(component.templateDays()).toEqual(['Push', 'Pull', 'Legs']);
  await component.savePlan();
  const plan = s.data().plans.find(item => item.name === 'Tre giorni')!;
  expect(s.days(plan.id).map(day => [day.name, day.order])).toEqual([['Push', 0], ['Pull', 1], ['Legs', 2]]);
  expect(component.modal()).toBe(''); expect(component.editing()).toBe(plan.id); expect(component.expanded()).toBe(plan.id);
  expect(component.openDayId()).toBe(s.days(plan.id)[0].id);
  // Una seconda richiesta (doppio tocco, nuovo tentativo) non aggiunge altri allenamenti.
  expect(await s.addPlanDays(plan.id, ['Extra'])).toBe(true);
  expect(s.days(plan.id)).toHaveLength(3);
  expect(await s.addPlanDays(plan.id, [])).toBe(false);
  expect(await s.addPlanDays('inesistente', ['Giorno'])).toBe(false);
  // La modifica del nome non ripropone la struttura né crea allenamenti.
  component.openPlan(plan);
  expect(component.sheetTitle()).toBe('Nome e descrizione'); expect(component.planTemplate()).toBe('');
  component.planForm.patchValue({ name: 'Tre giorni · v2' }); await component.savePlan();
  expect(s.days(plan.id)).toHaveLength(3); expect(s.data().plans.find(item => item.id === plan.id)!.name).toBe('Tre giorni · v2');
});

it('una scheda vuota resta vuota e un nuovo allenamento si apre subito per aggiungere esercizi', async () => {
  const component = createPlans();
  component.openPlan(); component.planForm.patchValue({ name: 'Vuota' }); await component.savePlan();
  const plan = s.data().plans.find(item => item.name === 'Vuota')!;
  expect(s.days(plan.id)).toEqual([]); expect(component.editing()).toBe(plan.id);
  component.startBuilding(plan.id);
  expect(component.modal()).toBe('day'); expect(component.sheetHint()).toBe('Vuota'); expect(component.dayIdeas()).toContain('Push');
  component.dayForm.patchValue({ name: 'Push', weekday: '2' }); await component.saveDay();
  const day = s.days(plan.id)[0];
  expect(day).toMatchObject({ name: 'Push', weekday: 2 }); expect(component.openDayId()).toBe(day.id);
  component.openDay(plan.id);
  expect(component.dayIdeas()).not.toContain('Push');
});

it('sceglie l’esercizio in due passi, eredita lo schema precedente e aggiunge più esercizi di fila', async () => {
  await s.savePlan('p', 'Piano', ''); await s.saveDay('d', 'p', 'Giorno');
  await s.savePlanExercise({ id: 'pe', dayId: 'd', exerciseId: 'exercise-0', sets: 4, repsMin: 6, repsMax: 10, rest: 120, notes: '', order: 0 });
  const component = createPlans();
  component.openExercise('d');
  expect(component.exerciseStep()).toBe('pick'); expect(component.sheetTitle()).toBe('Scegli l’esercizio'); expect(component.sheetHint()).toBe('Giorno');
  expect(component.exerciseForm.getRawValue()).toMatchObject({ exerciseId: '', sets: 4, repsMin: 6, repsMax: 10, rest: 120, targetWeight: null, warmupSets: 0 });
  expect(component.inDay('exercise-0')).toBe(true); expect(component.inDay('exercise-4')).toBe(false);
  const group = s.exercise('exercise-4')!.muscleGroupId;
  component.groupFilter.set(group);
  expect(component.availableExercises().length).toBeGreaterThan(0);
  expect(component.availableExercises().every(exercise => exercise.muscleGroupId === group)).toBe(true);
  expect(component.pickerGroups().some(item => item.id === group)).toBe(true);
  component.chooseExercise('exercise-4');
  expect(component.exerciseStep()).toBe('config'); expect(component.sheetTitle()).toBe('Serie e ripetizioni');
  component.bump('sets', -1, 1, 30); component.bump('repsMin', 5, 1, 999);
  expect(component.exerciseForm.getRawValue()).toMatchObject({ sets: 3, repsMin: 11, repsMax: 11 });
  component.bump('repsMax', -2, 1, 999);
  expect(component.exerciseForm.getRawValue()).toMatchObject({ repsMin: 9, repsMax: 9 });
  component.bump('warmupSets', 9, 0, 5); component.bump('sets', -99, 1, 30);
  expect(component.exerciseForm.getRawValue()).toMatchObject({ warmupSets: 5, sets: 1 });
  component.setReps(8, 12); component.setRest(180);
  expect(component.repsInverted()).toBe(false); expect(component.restLabel(180)).toBe('3:00'); expect(component.restLabel(45)).toBe('45 s');
  await component.saveExercise(true);
  expect(s.planExercises('d').map(entry => [entry.exerciseId, entry.sets, entry.repsMin, entry.repsMax, entry.rest, entry.warmupSets, entry.order])).toEqual([
    ['exercise-0', 4, 6, 10, 120, undefined, 0], ['exercise-4', 1, 8, 12, 180, 5, 1],
  ]);
  // «Salva e aggiungi un altro» riapre la scelta per lo stesso allenamento, con un nuovo identificativo.
  await vi.waitFor(() => expect(component.modal()).toBe('exercise'));
  expect(component.exerciseStep()).toBe('pick'); expect(component.parentId).toBe('d'); expect(component.editId).toBe('');
  expect(component.exerciseForm.getRawValue()).toMatchObject({ exerciseId: '', sets: 1, repsMin: 8, repsMax: 12, rest: 180 });
  await component.closeModal();
  expect(component.modal()).toBe(''); expect(s.planExercises('d')).toHaveLength(2);
  // Un esercizio già presente si apre direttamente sui valori, con le opzioni avanzate solo se usate.
  component.openExercise('d', s.planExercises('d')[0]);
  expect(component.exerciseStep()).toBe('config'); expect(component.sheetTitle()).toBe('Modifica esercizio'); expect(component.advancedOpen()).toBe(false);
  await component.closeModal();
  await s.savePlanExercise({ ...s.planExercises('d')[0], rpe: 8, superset: 'A' });
  component.openExercise('d', s.planExercises('d')[0]);
  expect(component.advancedOpen()).toBe(true); expect(component.advancedSummary()).toBe('RPE 8 · superset A');
});

it('riassume allenamento e serie per gruppo muscolare senza modificare l’archivio', async () => {
  await s.savePlan('p', 'Piano', ''); await s.saveDay('d', 'p', 'Giorno'); await s.saveDay('d2', 'p', 'Altro');
  await s.savePlanExercise({ id: 'a', dayId: 'd', exerciseId: 'exercise-0', sets: 4, repsMin: 6, repsMax: 10, rest: 120, notes: '', order: 0 });
  await s.savePlanExercise({ id: 'b', dayId: 'd2', exerciseId: 'exercise-0', sets: 3, repsMin: 8, repsMax: 12, rest: 90, warmupSets: 2, notes: '', order: 0 });
  const component = createPlans(), before = JSON.stringify(s.data().planExercises);
  const [first, second, plan] = [s.days('p')[0], s.days('p')[1], s.data().plans[0]];
  expect(component.dayMeta(first)).toBe('1 esercizio · 4 serie · ~10 min');
  expect(component.dayMeta(second)).toBe('1 esercizio · 3 serie · ~10 min');
  expect(component.planBalance(plan)).toEqual([{ name: s.muscle(s.exercise('exercise-0')!.muscleGroupId), sets: 7 }]);
  await s.saveDay('d3', 'p', 'Vuoto');
  expect(component.dayMeta(s.days('p')[2])).toBe('0 esercizi');
  expect(JSON.stringify(s.data().planExercises)).toBe(before);
});

it('in seduta il Coach Ombra propone l’aumento dopo una seduta completa, si applica con un tocco e si può ignorare', async () => {
  await s.savePlan('p', 'Piano', ''); await s.saveDay('d', 'p', 'Giorno');
  await s.savePlanExercise({ id: 'pe', dayId: 'd', exerciseId: 'exercise-0', sets: 3, repsMin: 8, repsMax: 12, rest: 90, notes: '', order: 0 });
  await s.start('d');
  const firstRow = s.workoutExercises(s.draft()!.id)[0];
  for (const set of s.sets(firstRow.id)) await s.updateSet(set.id, { weight: 60, reps: 12, rpe: 8, completed: true });
  expect(await s.finish()).toBe(true);
  await new Promise(resolve => setTimeout(resolve, 5));
  await s.start('d');
  const id = s.draft()!.id;
  active = runInInjectionContext(injector, () => new ActiveWorkoutComponent());
  Object.defineProperty(active, 'workoutId', { value: () => id });
  active.quickRecord(active.exercises()[0]);
  const coach = active.coach()!;
  expect(coach).toMatchObject({ action: 'raise', weight: 62.5, reps: 10, basis: 'reference', confidence: 'high', title: 'Sali di carico' });
  expect(coach.evidence[0]).toContain('60 kg × 12 · 12 · 12');
  expect(active.coachTarget()).toBe('62,5 kg × 10 rip.');
  expect(active.coachChips()).toEqual([{ text: '+2,5 kg', tone: 'up' }, { text: '−2 rip. vs volta scorsa', tone: 'same' }]);
  expect(active.coachApplied()).toBe(false);
  active.applyCoach();
  expect(active.weight).toBe(62.5); expect(active.reps).toBe(10); expect(active.coachApplied()).toBe(true);
  // Il suggerimento resta una proposta: nulla viene segnato come completato.
  await active.saveDraft();
  expect(s.sets(active.exerciseId()).every(set => !set.completed)).toBe(true);
  // Dopo una serie al limite il Coach si riadatta e consiglia più recupero.
  active.rpe = 10; active.reps = 9; await active.complete();
  await vi.waitFor(() => expect(active!.coach()).toMatchObject({ action: 'hold', weight: 62.5, reps: 8, basis: 'session', restBonus: 60 }));
  expect(active.coachRestBonus()).toBe(60);
  const end = active.restEnd();
  active.applyCoachRest();
  expect(active.restEnd()).toBeGreaterThan(end); expect(active.coachRestBonus()).toBe(0);
  active.dismissCoach();
  expect(active.coach()).toBeNull();
});
