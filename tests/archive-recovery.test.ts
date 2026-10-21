import '@angular/compiler';
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { expect, it } from 'vitest';
import { seed } from '../src/app/core/seed';
import { allowedArchiveNames, mergeRecoveredArchive, readExistingArchive } from '../src/app/services/archive-recovery';
import { validateIntegrity } from '../src/app/services/integrity';
function planned(name = 'Piano originale') {
  const data = seed(), at = '2026-10-21T00:00:00.000Z';
  data.plans.push({ id: 'plan', userId: 'local', name, description: 'Da conservare', active: true, archived: false, createdAt: at, updatedAt: at });
  data.days.push({ id: 'day', planId: 'plan', name: 'Giorno A', order: 0 });
  data.planExercises.push({ id: 'entry', dayId: 'day', exerciseId: 'exercise-0', sets: 3, repsMin: 8, repsMax: 12, rest: 90, notes: 'I miei valori', order: 0 });
  return data;
}
it('preserves the current plan and recovers the complete conflicting plan graph and edited exercise without overwriting either', async () => {
  const current = planned('Piano attuale'), source = planned('Piano recuperato');
  source.exercises[0].name = 'Panca personalizzata';
  source.exercises[0].image = new Blob([new Uint8Array([255, 216, 255, 1])], { type: 'image/jpeg' });
  source.planExercises.push({ ...source.planExercises[0], id: 'lost-entry', exerciseId: 'exercise-1', order: 1 });
  const merged = await mergeRecoveredArchive(current, source, 'gymtrack-v1');
  expect(merged.plans.find(plan => plan.id === 'plan')?.name).toBe('Piano attuale');
  const recovered = merged.plans.find(plan => plan.id !== 'plan')!;
  expect(recovered.name).toContain('Piano recuperato');expect(recovered.active).toBe(false);
  const day = merged.days.find(day => day.planId === recovered.id)!;
  const entries = merged.planExercises.filter(entry => entry.dayId === day.id);
  expect(entries).toHaveLength(2);
  const recoveredExercise = merged.exercises.find(exercise => exercise.id === entries[0].exerciseId)!;
  expect(recoveredExercise.id).not.toBe('exercise-0');expect(recoveredExercise.name).toBe('Panca personalizzata');
  expect(await recoveredExercise.image!.arrayBuffer()).toEqual(await source.exercises[0].image!.arrayBuffer());
  expect(current.plans).toHaveLength(1);expect(source.plans).toHaveLength(1);
  expect(current.exercises[0].name).not.toBe('Panca personalizzata');
  const repeated = await mergeRecoveredArchive(merged, source, 'gymtrack-v1');
  expect(repeated.plans).toEqual(merged.plans);expect(repeated.planExercises).toEqual(merged.planExercises);expect(repeated.exercises).toEqual(merged.exercises);
  expect(() => validateIntegrity(repeated)).not.toThrow();
});
it('adds a missing plan with original ids and preserves target profile, settings, meals and history', async () => {
  const current = seed(), source = planned();current.profiles[0].name = 'Profilo attuale';current.settings[0].unit = 'lb';
  const merged = await mergeRecoveredArchive(current, source, 'device');
  expect(merged.plans[0].id).toBe('plan');expect(merged.days[0].id).toBe('day');expect(merged.planExercises[0].id).toBe('entry');
  expect(merged.profiles).toEqual(current.profiles);expect(merged.settings).toEqual(current.settings);expect(merged.meals).toEqual(current.meals);expect(merged.workouts).toEqual(current.workouts);
  expect((await mergeRecoveredArchive(merged, source, 'device')).plans).toHaveLength(1);
});
it('reads an old archive without migrating it or creating a missing archive', async () => {
  const name = 'read-old-' + crypto.randomUUID(), missing = 'missing-' + crypto.randomUUID(), db = new Dexie(name);
  db.version(1).stores({ profiles: 'id', roles: 'id', settings: 'id', exercises: 'id', muscleGroups: 'id', plans: 'id', days: 'id', planExercises: 'id' });
  const data = planned();for (const table of db.tables) await table.bulkPut(data[table.name as keyof typeof data]);db.close();
  try {
    expect((await readExistingArchive(name))?.plans[0].name).toBe('Piano originale');
    const reopened = new Dexie(name);await reopened.open();expect(reopened.verno).toBe(1);expect(await reopened.table('plans').toArray()).toEqual(data.plans);reopened.close();
    expect(await readExistingArchive(missing)).toBeUndefined();expect(await Dexie.exists(missing)).toBe(false);
  } finally { await Dexie.delete(name); }
});
it('limits recovery to known archives and requires verified platform ownership to expose the legacy owner archive to local mode', () => {
  expect(allowedArchiveNames(null, true)).toEqual([]);
  expect(allowedArchiveNames({ id: 'client', owner: false })).toEqual(['gymtrack-user-client', 'gymtrack-user-device-local']);
  expect(allowedArchiveNames({ id: 'device-local', owner: false })).toEqual(['gymtrack-user-device-local']);
  expect(allowedArchiveNames({ id: 'device-local', owner: false }, true)).toEqual(['gymtrack-user-device-local', 'gymtrack-v1']);
  expect(allowedArchiveNames({ id: 'owner', owner: true })).toEqual(['gymtrack-v1', 'gymtrack-user-device-local']);
});
