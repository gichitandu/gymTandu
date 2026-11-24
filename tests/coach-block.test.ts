import { describe, expect, it } from 'vitest';
import type { DataSet } from '../src/app/models/domain';
import { DEFAULT_PROFILE, generatePlan } from '../src/app/coach/index';
import { insertCoachPlan } from '../src/app/services/coach-expert-adapter';
import { coachBlockReview } from '../src/app/services/coach-block';

const empty = (): DataSet => ({
  wellnessLogs: [], exercisePreferences: [], workoutUi: [], profiles: [], roles: [], creatineLogs: [],
  plans: [], days: [], planExercises: [], exercises: [], muscleGroups: [], workouts: [],
  workoutExercises: [], sets: [], settings: [], meals: [], scheduledWorkouts: [], measurements: [],
} as unknown as DataSet);

/** Piano Coach di 3 giorni creato il 2 novembre, con sedute sintetiche sul primo esercizio. */
function archive(sessions: { date: string; weight: number; reps: number; rpe?: number }[]) {
  const data = empty();
  const planId = insertCoachPlan(data, generatePlan(structuredClone(DEFAULT_PROFILE), [], '2026-11-02'));
  const day = data.days.find(row => row.planId === planId)!;
  const prescription = data.planExercises.find(row => row.dayId === day.id)!;
  sessions.forEach((session, index) => {
    const workoutId = 'w' + index, rowId = 'r' + index;
    data.workouts.push({ id: workoutId, userId: 'local', planId, dayId: day.id, planName: 'Coach', dayName: day.name, date: session.date, startedAt: session.date + 'T10:00:00.000Z', duration: 45, notes: '', status: 'completed' } as DataSet['workouts'][number]);
    data.workoutExercises.push({ id: rowId, workoutId, exerciseId: prescription.exerciseId, name: 'Leg press', loadMode: 'external', order: 0, rest: 120, notes: '' } as DataSet['workoutExercises'][number]);
    data.sets.push({ id: 's' + index, workoutExerciseId: rowId, number: 1, weight: session.weight, reps: session.reps, rpe: session.rpe, completed: true } as DataSet['sets'][number]);
  });
  return { data, planId };
}

describe('Blocco del piano Coach', () => {
  it('ignora i piani non creati dal Coach', () => {
    const data = empty();
    data.plans.push({ id: 'p', userId: 'local', name: 'Mio piano', description: '', createdAt: '2026-11-02', updatedAt: '2026-11-02', active: true, archived: false });
    expect(coachBlockReview(data, 'p', '2026-12-10')).toBeNull();
  });

  it('durante il blocco indica la settimana in corso', () => {
    const { data, planId } = archive([]);
    expect(coachBlockReview(data, planId, '2026-11-10')).toMatchObject({ weeks: 4, week: 2, ended: false, expected: 12 });
    expect(coachBlockReview(data, planId, '2026-11-24')!.advice).toContain('Ultima settimana');
  });

  it('a fine blocco con costanza riassume i progressi e propone scarico e nuovo piano', () => {
    const dates = ['2026-11-02', '2026-11-04', '2026-11-06', '2026-11-09', '2026-11-11', '2026-11-13', '2026-11-16', '2026-11-18', '2026-11-20', '2026-11-23'];
    const { data, planId } = archive(dates.map((date, index) => ({ date, weight: 100 + index * 2.5, reps: 10, rpe: 8 })));
    const review = coachBlockReview(data, planId, '2026-11-30')!;
    expect(review).toMatchObject({ ended: true, sessions: 10, expected: 12 });
    expect(review.progress[0]).toEqual({ name: 'Leg press', percent: 23 });
    expect(review.advice).toContain('settimana di scarico');
    expect(review.advice).toContain('nuovo piano dal Coach');
  });

  it('con poche sedute consiglia di ripetere il blocco prima di cambiare', () => {
    const { data, planId } = archive([{ date: '2026-11-03', weight: 100, reps: 10, rpe: 8 }, { date: '2026-11-20', weight: 100, reps: 10, rpe: 8 }]);
    expect(coachBlockReview(data, planId, '2026-12-01')!.advice).toContain('ripeti il blocco');
  });
});
