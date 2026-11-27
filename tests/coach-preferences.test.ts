import { describe, expect, it } from 'vitest';
import { CATALOG, DEFAULT_PROFILE, generatePlan, weekFocuses } from '../src/app/coach/index';
import type { DayFocus, Muscle, Profile, SplitMode } from '../src/app/coach/models';
import { insertCoachPlan, profileFromSavedPlan } from '../src/app/services/coach-expert-adapter';
import { coachBlockReview } from '../src/app/services/coach-block';

const AS_OF = '2026-11-27';
const ALL: Profile['equipment'] = ['machine', 'cable', 'dumbbell', 'barbell', 'bodyweight'];
const profile = (patch: Partial<Profile> = {}): Profile => ({
  ...structuredClone(DEFAULT_PROFILE), experience: 'intermediate', equipment: [...ALL], ...patch,
});
const primary = (id: string): Muscle[] => CATALOG.find(e => e.id === id)!.primary;
const LEGS: Muscle[] = ['quads', 'hamstrings', 'glutes', 'calves'];

describe('struttura settimanale a scelta', () => {
  it('senza preferenze la proposta automatica resta quella di prima', () => {
    for (const daysPerWeek of [1, 2, 3, 4, 5, 6]) {
      const legacy = generatePlan(profile({ daysPerWeek }), [], AS_OF);
      const explicit = generatePlan(profile({ daysPerWeek, split: 'auto' }), [], AS_OF);
      expect(explicit.sessions).toEqual(legacy.sessions);
      expect(legacy.blockWeeks).toBe(4);
      expect(legacy.decisions.find(d => d.ruleId === 'week-structure')?.kind).toBe('heuristic');
    }
    expect(generatePlan(profile({ daysPerWeek: 4 }), [], AS_OF).sessions.map(s => s.name)).toEqual(['Upper A', 'Lower A', 'Upper B', 'Lower B']);
  });

  it('ogni struttura genera il numero di sedute scelto nel tempo disponibile', () => {
    const splits: SplitMode[] = ['auto', 'full-body', 'upper-lower', 'push-pull-legs', 'body-part'];
    for (const split of splits) for (const daysPerWeek of [1, 2, 3, 4, 5, 6]) for (const minutesPerSession of [30, 60, 90]) {
      const plan = generatePlan(profile({ split, daysPerWeek, minutesPerSession }), [], AS_OF);
      const label = `${split}/${daysPerWeek}/${minutesPerSession}`;
      expect(plan.sessions, label).toHaveLength(daysPerWeek);
      expect(new Set(plan.sessions.map(s => s.name)).size, label).toBe(daysPerWeek);
      for (const day of plan.sessions) {
        expect(day.exercises.length, label).toBeGreaterThan(0);
        expect(day.estimatedMinutes, label).toBeLessThanOrEqual(minutesPerSession);
        expect(new Set(day.exercises.map(e => e.exerciseId)).size, label).toBe(day.exercises.length);
      }
    }
  });

  it('push / pull / legs separa spinta, tirata e gambe', () => {
    const plan = generatePlan(profile({ split: 'push-pull-legs', daysPerWeek: 6, minutesPerSession: 75 }), [], AS_OF);
    expect(plan.sessions.map(s => s.name)).toEqual(['Push A', 'Pull A', 'Lower A', 'Push B', 'Pull B', 'Lower B']);
    const push = plan.sessions[0]!.exercises.flatMap(e => primary(e.exerciseId));
    const pull = plan.sessions[1]!.exercises.flatMap(e => primary(e.exerciseId));
    expect(push).toContain('chest');
    expect(push.some(m => LEGS.includes(m) || m === 'back' || m === 'biceps')).toBe(false);
    expect(pull).toContain('back');
    expect(pull.some(m => LEGS.includes(m) || m === 'chest' || m === 'triceps')).toBe(false);
    expect(plan.decisions.find(d => d.ruleId === 'week-structure')).toMatchObject({ kind: 'constraint' });
  });

  it('la settimana personalizzata rispetta il contenuto di ogni seduta', () => {
    const customDays: DayFocus[] = ['upper', 'upper', 'upper', 'upper', 'lower', 'lower'];
    const plan = generatePlan(profile({ split: 'custom', daysPerWeek: 6, customDays }), [], AS_OF);
    expect(plan.sessions.map(s => s.name)).toEqual(['Upper A', 'Upper B', 'Upper C', 'Upper D', 'Lower A', 'Lower B']);
    for (const day of plan.sessions.slice(0, 4)) expect(day.exercises.some(e => primary(e.exerciseId).some(m => LEGS.includes(m)))).toBe(false);
    const glutes = generatePlan(profile({ split: 'custom', daysPerWeek: 2, customDays: ['shoulders-arms', 'glutes-hamstrings'] }), [], AS_OF);
    expect(glutes.sessions.map(s => s.name)).toEqual(['Spalle e braccia', 'Glutei e femorali']);
    expect(glutes.sessions[1]!.exercises.some(e => primary(e.exerciseId)[0] === 'glutes')).toBe(true);
  });

  it('la proposta visibile coincide con le sedute generate', () => {
    expect(weekFocuses({ daysPerWeek: 5 })).toEqual(['upper', 'lower', 'upper', 'lower', 'full']);
    expect(weekFocuses({ daysPerWeek: 3, split: 'push-pull-legs' })).toEqual(['push', 'pull', 'lower']);
    expect(weekFocuses({ daysPerWeek: 2, split: 'push-pull-legs' })).toEqual(['upper', 'lower']);
    // Cambiando il numero di sedute la settimana personalizzata conserva le scelte e completa le altre.
    expect(weekFocuses({ daysPerWeek: 4, split: 'custom', customDays: ['push', 'pull'] })).toEqual(['push', 'pull', 'upper', 'lower']);
    expect(weekFocuses({ daysPerWeek: 1, split: 'custom', customDays: ['pull', 'push'] })).toEqual(['pull']);
  });

  it('le priorità entrano solo nelle sedute che allenano quel muscolo', () => {
    const plan = generatePlan(profile({ split: 'push-pull-legs', daysPerWeek: 3, minutesPerSession: 90, priorities: ['biceps', 'back'] }), [], AS_OF);
    const [push, pull] = plan.sessions;
    expect(push!.exercises.some(e => primary(e.exerciseId).includes('biceps'))).toBe(false);
    expect(pull!.exercises.filter(e => primary(e.exerciseId).includes('back')).length).toBeGreaterThanOrEqual(3);
  });
});

describe('durata e composizione', () => {
  it('ogni seduta può avere la sua durata', () => {
    const plan = generatePlan(profile({ daysPerWeek: 3, minutesPerSession: 60, sessionMinutes: [30, null, 90] }), [], AS_OF);
    expect(plan.sessions[0]!.estimatedMinutes).toBeLessThanOrEqual(30);
    expect(plan.sessions[1]!.estimatedMinutes).toBeLessThanOrEqual(60);
    expect(plan.sessions[2]!.estimatedMinutes).toBeLessThanOrEqual(90);
    expect(plan.sessions[0]!.exercises.length).toBeLessThan(plan.sessions[2]!.exercises.length);
    expect(plan.decisions.some(d => d.ruleId === 'session-minutes')).toBe(true);
  });

  it('rispetta il blocco e il numero massimo di esercizi', () => {
    const plan = generatePlan(profile({ blockWeeks: 8, maxExercises: 4, minutesPerSession: 120 }), [], AS_OF);
    expect(plan.blockWeeks).toBe(8);
    for (const day of plan.sessions) expect(day.exercises.length).toBeLessThanOrEqual(4);
  });

  it('volume e recuperi cambiano serie e pause in modo dichiarato', () => {
    const base = generatePlan(profile({ minutesPerSession: 120 }), [], AS_OF).sessions[0]!.exercises[0]!;
    const more = generatePlan(profile({ minutesPerSession: 120, volume: 'high', rest: 'long' }), [], AS_OF).sessions[0]!.exercises[0]!;
    const less = generatePlan(profile({ minutesPerSession: 120, volume: 'low', rest: 'short' }), [], AS_OF).sessions[0]!.exercises[0]!;
    expect(more.sets).toBe(base.sets + 1);
    expect(less.sets).toBe(base.sets - 1);
    expect(more.restSeconds).toBe(base.restSeconds + 30);
    expect(less.restSeconds).toBe(Math.max(45, base.restSeconds - 30));
    expect(more.decisions.map(d => d.ruleId)).toEqual(expect.arrayContaining(['volume-preference', 'rest-preference']));
    expect(base.decisions.some(d => d.ruleId === 'volume-preference' || d.ruleId === 'rest-preference')).toBe(false);
  });

  it('sceglie prima gli esercizi preferiti e segnala quelli che non entrano', () => {
    const plan = generatePlan(profile({ preferredExerciseIds: ['dumbbell-bench-press', 'barbell-squat', 'cable-crunch'], split: 'custom', daysPerWeek: 1, customDays: ['push'] }), [], AS_OF);
    const ids = plan.sessions.flatMap(s => s.exercises.map(e => e.exerciseId));
    expect(ids[0]).toBe('dumbbell-bench-press');
    expect(ids).not.toContain('barbell-squat');
    expect(plan.warnings.some(w => w.includes('Squat con bilanciere'))).toBe(true);
  });

  it('con la variazione attiva le sedute dello stesso tipo cambiano esercizi', () => {
    const same = generatePlan(profile({ daysPerWeek: 4, minutesPerSession: 60 }), [], AS_OF);
    const varied = generatePlan(profile({ daysPerWeek: 4, minutesPerSession: 60, varyRepeatedDays: true }), [], AS_OF);
    const ids = (i: number, plan = varied) => plan.sessions[i]!.exercises.map(e => e.exerciseId);
    expect(ids(2, same)).toEqual(ids(0, same));
    expect(ids(2).filter(id => ids(0).includes(id)).length).toBeLessThan(ids(2).length);
  });

  it('rifiuta preferenze non valide con messaggi leggibili', () => {
    const invalid: Partial<Profile>[] = [
      { split: 'random' as SplitMode },
      { split: 'custom', daysPerWeek: 3, customDays: ['push'] },
      { customDays: ['legs' as DayFocus] },
      { sessionMinutes: [10] },
      { blockWeeks: 1 },
      { maxExercises: 20 },
      { volume: 'max' as Profile['volume'] },
      { rest: 'none' as Profile['rest'] },
      { preferredExerciseIds: [3 as unknown as string] },
    ];
    for (const patch of invalid) expect(() => generatePlan(profile(patch), [], AS_OF), JSON.stringify(patch)).toThrow(RangeError);
  });
});

describe('salvataggio nelle schede', () => {
  it('conserva struttura, durata del blocco e preferenze nel piano salvato', () => {
    const data = { wellnessLogs: [], exercisePreferences: [], workoutUi: [], profiles: [], roles: [], plans: [], days: [], planExercises: [], exercises: [], muscleGroups: [], workouts: [], workoutExercises: [], sets: [], settings: [], meals: [], scheduledWorkouts: [], measurements: [] } as unknown as Parameters<typeof insertCoachPlan>[0];
    const p = profile({ split: 'push-pull-legs', daysPerWeek: 3, blockWeeks: 6, sessionMinutes: [45, null, 75], volume: 'high' });
    const planId = insertCoachPlan(data, generatePlan(p, [], AS_OF));
    const saved = data.plans.find(row => row.id === planId)!;
    expect(saved.name).toBe('Coach · 3 giorni · Push / Pull / Legs');
    expect(data.days.filter(day => day.planId === planId).map(day => day.name)).toEqual(['Push', 'Pull', 'Lower']);
    expect(coachBlockReview(data, planId, AS_OF)).toMatchObject({ weeks: 6, expected: 18 });
    expect(profileFromSavedPlan(data)).toMatchObject({ split: 'push-pull-legs', blockWeeks: 6, sessionMinutes: [45, null, 75], volume: 'high' });
  });
});
