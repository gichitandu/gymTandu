/**
 * Run in the ACTUAL GymTrack checkout after applying the overlay:
 * copy this file to <gymtrack>/tests/coach-native-integration.test.ts,
 * then: npm test -- tests/coach-native-integration.test.ts
 * It exercises the real native validator, not a reimplementation or mock.
 * Synthetic seed only; no personal archive is read.
 */
import '@angular/compiler';
import { describe, expect, it } from 'vitest';
import { seed } from '../src/app/core/seed';
import { validateIntegrity } from '../src/app/services/integrity';
import { DEFAULT_PROFILE, generatePlan } from '../src/app/coach/index';
import { bindProfileToGymTrack, insertCoachPlan } from '../src/app/services/coach-expert-adapter';

describe('compatibilità con archivio GymTrack nativo', () => {
  it('i programmi generati rispettano il validatore esistente, anche con superserie abilitate', () => {
    for (const goal of ['hypertrophy', 'strength', 'endurance'] as const) {
      for (const daysPerWeek of [2, 3, 4]) {
        const data = seed();
        const profile = bindProfileToGymTrack({
          ...structuredClone(DEFAULT_PROFILE), goal, daysPerWeek, experience: 'advanced',
          minutesPerSession: 75, allowSupersets: true, allowDropSets: true, allowFailure: true,
        }, data);
        const plan = generatePlan(profile, [], '2026-11-13');
        insertCoachPlan(data, plan);
        expect(() => validateIntegrity(data)).not.toThrow();
        for (const exercise of data.planExercises) {
          if (exercise.superset) expect(['A', 'B', 'C', 'D']).toContain(exercise.superset);
        }
      }
    }
  });

  it('conserva piano attivo e archivio valido durante un inserimento aggiuntivo', () => {
    const data = seed();
    data.plans.push({ id: 'existing-plan', userId: 'local', name: 'Piano esistente', description: 'Conservare',
      createdAt: '2026-10-01', updatedAt: '2026-10-01', active: true, archived: false });
    const prior = structuredClone(data.plans[0]);
    const profile = bindProfileToGymTrack(structuredClone(DEFAULT_PROFILE), data);
    insertCoachPlan(data, generatePlan(profile, [], '2026-11-13'));
    expect(data.plans[0]).toEqual(prior);
    expect(data.plans.filter(p => p.active)).toHaveLength(1);
    expect(() => validateIntegrity(data)).not.toThrow();
  });
});
