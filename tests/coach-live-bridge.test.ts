/** Synthetic archive only. Exercises the actual injected bridge and native validator. */
import '@angular/compiler';
import {
  createEnvironmentInjector, EnvironmentInjector, runInInjectionContext, signal,
} from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seed } from '../src/app/core/seed';
import { DEFAULT_PROFILE, generatePlan } from '../src/app/coach/index';
import type { TrainingPlan } from '../src/app/coach/models';
import type { DataSet, TrainingPlanExercise, WorkoutLogExercise, WorkoutLogSet } from '../src/app/models/domain';
import { Store } from '../src/app/services/store';
import { CoachExpertBridge } from '../src/app/services/coach-expert-bridge';
import { annotateSetNotes, bindProfileToGymTrack, getWorkoutPrescription } from '../src/app/services/coach-expert-adapter';
import { validateIntegrity } from '../src/app/services/integrity';

const NOW = '2026-11-13T12:00:00.000Z';
const injectors: EnvironmentInjector[] = [];

function harness(initial: DataSet = seed(), archiveKey = 'synthetic-account') {
  const data = signal(structuredClone(initial));
  const error = signal('');
  // Mirrors the host's public transaction contract. The real bridge decides what
  // to write; this facade commits only a cloned, validated unpublished snapshot.
  const change = vi.fn(async (mutate: (next: DataSet) => void | Promise<void>, _message?: string) => {
    const next = structuredClone(data());
    try {
      await mutate(next);
      validateIntegrity(next);
      data.set(next);
      error.set('');
      return true;
    } catch (cause) {
      error.set(cause instanceof Error ? cause.message : 'Errore sintetico');
      return false;
    }
  });
  const updateSet = vi.fn(async (id: string, patch: Partial<WorkoutLogSet>) => change(next => {
    const target = next.sets.find(row => row.id === id);
    if (!target) throw Error('Serie sintetica non trovata');
    Object.assign(target, patch);
  }));
  const facade = { data, error, change, updateSet, archiveKey: () => archiveKey, profile: () => data().profiles[0] };
  const injector = createEnvironmentInjector([{ provide: Store, useValue: facade }], null as unknown as EnvironmentInjector);
  injectors.push(injector);
  const bridge = runInInjectionContext(injector, () => new CoachExpertBridge());
  const plan = () => generatePlan(bindProfileToGymTrack(structuredClone(DEFAULT_PROFILE), data()), [], NOW);
  return { data, error, change, updateSet, bridge, plan };
}
type Harness = ReturnType<typeof harness>;

function addDraft(h: Harness, corePlan: TrainingPlan) {
  const next = structuredClone(h.data());
  const nativePlan = next.plans.find(row => row.description.includes(corePlan.id))!;
  const day = next.days.find(row => row.planId === nativePlan.id)!;
  const planned = next.planExercises.find(row => row.dayId === day.id && row.loadUnit !== 'corpo libero')!;
  const exercise: WorkoutLogExercise = {
    id: 'live-exercise', workoutId: 'live-workout', exerciseId: planned.exerciseId,
    name: next.exercises.find(row => row.id === planned.exerciseId)!.name,
    loadMode: 'external', order: 0, rest: planned.rest, notes: planned.notes,
    reference: planned.reference, repsMin: planned.repsMin, repsMax: planned.repsMax,
    rirMin: planned.rirMin, rirMax: planned.rirMax, loadUnit: planned.loadUnit,
    machineSetup: { machine: 'Synthetic gym - machine A', seat: '3' },
  };
  next.workouts.push({ id: 'live-workout', userId: 'local', planId: nativePlan.id,
    dayId: day.id, planName: nativePlan.name, dayName: day.name, date: '2026-11-13',
    startedAt: NOW, duration: 0, notes: '', status: 'draft' });
  next.workoutExercises.push(exercise);
  for (let number = 1; number <= planned.sets; number++) next.sets.push({
    id: `live-set-${number}`, workoutExerciseId: exercise.id, number,
    weight: 0, reps: planned.repsMin, completed: false, kind: 'work',
  });
  validateIntegrity(next);
  h.data.set(next);
  return { planned, exercise };
}

function addComparableHistory(h: Harness, planned: TrainingPlanExercise, exercise: WorkoutLogExercise, goodTechnique: boolean) {
  const next = structuredClone(h.data());
  for (const [index, date] of ['2026-11-06', '2026-11-10'].entries()) {
    const workoutId = `past-workout-${index}`, exerciseId = `past-exercise-${index}`;
    next.workouts.push({ ...next.workouts.find(row => row.id === 'live-workout')!,
      id: workoutId, date, startedAt: `${date}T10:00:00Z`, endedAt: `${date}T11:00:00Z`,
      duration: 60, status: 'completed' });
    next.workoutExercises.push({ ...structuredClone(exercise), id: exerciseId, workoutId });
    for (let number = 1; number <= planned.sets; number++) next.sets.push({
      id: `${exerciseId}-set-${number}`, workoutExerciseId: exerciseId, number,
      weight: 40, reps: planned.repsMax, completed: true, kind: 'work',
      rpe: 10 - (planned.rirMin ?? 3),
      ...(goodTechnique ? { notes: annotateSetNotes('', { technique: 'good', pain: false, rir: planned.rirMin ?? 3 }) } : {}),
    });
  }
  validateIntegrity(next);
  h.data.set(next);
}

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(NOW);
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
    clear: () => values.clear(),
  });
});
afterEach(() => {
  for (const injector of injectors.splice(0)) injector.destroy();
  vi.unstubAllGlobals(); vi.useRealTimers();
});

describe('CoachExpertBridge nel flusso nativo', () => {
  it('salva tramite una sola transazione e conserva il piano attivo', async () => {
    const data = seed();
    data.plans.push({ id: 'active-original', userId: 'local', name: 'Originale', description: 'Da conservare',
      createdAt: '2026-10-01', updatedAt: '2026-10-01', active: true, archived: false });
    const h = harness(data), before = structuredClone(h.data().plans[0]);
    const result = await h.bridge.savePlan(h.plan());
    expect(result.ok).toBe(true);
    expect(h.change).toHaveBeenCalledTimes(1);
    expect(h.data().plans[0]).toEqual(before);
    expect(h.data().plans.filter(row => row.active)).toHaveLength(1);
    expect(() => validateIntegrity(h.data())).not.toThrow();
  });

  it('non pubblica una modifica parziale se il piano contiene una prescrizione invalida', async () => {
    const h = harness(), invalid = h.plan(), before = structuredClone(h.data());
    invalid.sessions[0].exercises[0].sets = -1;
    const result = await h.bridge.savePlan(invalid);
    expect(result.ok).toBe(false);
    expect(h.change).toHaveBeenCalledTimes(1);
    expect(h.data()).toEqual(before);
    expect(h.error()).not.toBe('');
  });

  it('propone una calibrazione sul primo set e legge lo snapshot della scheda', async () => {
    const h = harness(), plan = h.plan();
    await h.bridge.savePlan(plan);
    const { exercise } = addDraft(h, plan), before = structuredClone(h.data());
    expect(h.bridge.prescriptionForWorkout(exercise.id)).toEqual(getWorkoutPrescription(exercise));
    expect(h.bridge.liveSuggestion(exercise.id, 'live-set-1')).toMatchObject({ action: 'calibrate', loadKg: null, setNumber: 1 });
    expect(h.data()).toEqual(before);
  });

  it('usa il carico effettivo e il feedback salvato per la prossima serie', async () => {
    const h = harness(), plan = h.plan();
    await h.bridge.savePlan(plan);
    const { planned, exercise } = addDraft(h, plan);
    await h.updateSet('live-set-1', { weight: 40, reps: planned.repsMin + 1, completed: true });
    expect(await h.bridge.saveSetFeedback('live-set-1', { technique: 'good', pain: false, rir: 3 })).toBe(true);
    const before = structuredClone(h.data());
    expect(h.bridge.suggestForSet(exercise.id, 'live-set-2')).toMatchObject({ action: 'maintain', loadKg: 40, setNumber: 2 });
    expect(h.updateSet).toHaveBeenCalledTimes(2);
    expect(h.data()).toEqual(before);
  });

  it('non usa il solo RPE come conferma della qualità tecnica per aumentare', async () => {
    const h = harness(), plan = h.plan();
    await h.bridge.savePlan(plan);
    const { planned, exercise } = addDraft(h, plan);
    addComparableHistory(h, planned, exercise, false);
    expect(h.bridge.getHistory()).toHaveLength(2);
    expect(h.bridge.getHistory().every(row => row.sets.every(set => set.rir !== null && set.technique === 'unknown'))).toBe(true);
    expect(h.bridge.liveSuggestion(exercise.id, 'live-set-1')?.loadKg).toBe(40);
  });

  it('propone un aumento quando due sedute reali confrontabili hanno anche feedback tecnico', async () => {
    const h = harness(), plan = h.plan();
    await h.bridge.savePlan(plan);
    const { planned, exercise } = addDraft(h, plan);
    addComparableHistory(h, planned, exercise, true);
    expect(h.bridge.liveSuggestion(exercise.id, 'live-set-1')?.loadKg).toBeGreaterThan(40);
  });

  it('conserva il riferimento senza aumentare se manca il nome della macchina fisica', async () => {
    const h = harness(), plan = h.plan();
    await h.bridge.savePlan(plan);
    const { planned, exercise } = addDraft(h, plan);
    addComparableHistory(h, planned, exercise, true);
    const next = structuredClone(h.data());
    for (const row of next.workoutExercises) row.machineSetup = { seat: '3' };
    h.data.set(next);
    expect(h.bridge.getHistory().every(row => row.sets.every(set => set.rir !== null && set.technique === 'good'))).toBe(true);
    expect(h.bridge.liveSuggestion(exercise.id, 'live-set-1')?.loadKg).toBe(40);
  });

  it('interrompe il suggerimento quando il feedback del set registra dolore', async () => {
    const h = harness(), plan = h.plan();
    await h.bridge.savePlan(plan);
    const { exercise } = addDraft(h, plan);
    await h.updateSet('live-set-1', { weight: 40, reps: 10, completed: true });
    await h.bridge.saveSetFeedback('live-set-1', { technique: 'good', pain: true, rir: 3 });
    expect(h.bridge.liveSuggestion(exercise.id, 'live-set-2')).toMatchObject({ action: 'stop', loadKg: null });
  });

  it('isola le preferenze tra account sintetici diversi', () => {
    const first = harness(seed(), 'account-A'), second = harness(seed(), 'account-B');
    first.bridge.saveProfile({ ...structuredClone(DEFAULT_PROFILE), daysPerWeek: 2 });
    expect(first.bridge.loadProfile()?.daysPerWeek).toBe(2);
    expect(second.bridge.loadProfile()?.daysPerWeek).toBe(DEFAULT_PROFILE.daysPerWeek);
  });
});
