import { expect, it } from 'vitest';
import { seed } from '../src/app/core/seed';
import { alignedOrder, ensureGroupExercise, exerciseNameKey, groupExercisesOf, GroupExercise, inviteLink, inviteTokenFromUrl, memberProgress, sharedExercises } from '../src/app/services/group-workout';

const shared = (exerciseId: string, name: string, extra: Partial<GroupExercise> = {}): GroupExercise => ({ exerciseId, name, loadMode: 'external', order: 0, muscleGroupId: 'g', muscleGroupName: 'Gruppo', equipment: 'Manubri', sets: 3, warmupSets: 0, repsMin: 8, repsMax: 10, rest: 90, done: 0, total: 3, ...extra });
const row = (id: string, name: string, order: number, extra: any = {}) => ({ id, exerciseId: 'my-' + id, name, order, started: false, ...extra });

it('riconosce il link di invito solo se il token è ben formato', () => {
  const token = 'ab'.repeat(24);
  expect(inviteTokenFromUrl(inviteLink('https://gym.example', token))).toBe(token);
  expect(inviteTokenFromUrl(`https://gym.example/#/gruppo?x=1&invito=${token}&y=2`)).toBe(token);
  expect(inviteTokenFromUrl('https://gym.example/#/gruppo?invito=123')).toBe('');
  expect(inviteTokenFromUrl('https://gym.example/#/gruppo?invito=' + 'Z'.repeat(48))).toBe('');
});

it('abbina gli esercizi per ID oppure per nome, ignorando maiuscole, accenti e punteggiatura', () => {
  expect(exerciseNameKey('  Panca-Piana  (bilanciere) ')).toBe('panca piana bilanciere');
  const mine = [{ exerciseId: 'x1', name: 'Curl manubri' }, { exerciseId: 'squat', name: 'Accosciata' }, { exerciseId: 'x2', name: 'panca piana' }];
  const theirs = [shared('p', 'Panca Piana'), shared('squat', 'Squat'), shared('z', 'Lat machine')];
  expect(sharedExercises(mine, theirs).map(p => [p.mine.exerciseId, p.theirs.exerciseId])).toEqual([['x2', 'p'], ['squat', 'squat']]);
});

it('non abbina due volte lo stesso esercizio e preferisce l’ID esatto al nome', () => {
  const mine = [{ exerciseId: 'a', name: 'Panca piana' }, { exerciseId: 'p', name: 'Panca piana' }];
  expect(sharedExercises(mine, [shared('p', 'Panca piana')]).map(p => p.mine.exerciseId)).toEqual(['p']);
  expect(sharedExercises([mine[0]], [shared('p', 'Panca piana'), shared('q', 'Panca piana')])).toHaveLength(1);
});

it('allinea gli esercizi in comune negli stessi momenti della seduta di riferimento', () => {
  const reference = [shared('s1', 'Squat'), shared('h1', 'Leg extension'), shared('s2', 'Panca piana'), shared('h2', 'Croci')];
  const mine = [row('g1', 'Curl', 0), row('p', 'Panca piana', 1), row('s', 'Squat', 2), row('g2', 'French press', 3)];
  expect(alignedOrder(mine, reference)).toEqual(['s', 'g1', 'p', 'g2']);
});

it('lascia davanti gli esercizi già iniziati, tiene uniti i superset e non perde nulla', () => {
  const reference = [shared('s1', 'Squat'), shared('s2', 'Panca piana')];
  const mine = [row('a', 'Trazioni', 0, { started: true }), row('b', 'Panca piana', 1, { superset: 'A' }), row('c', 'Rematore', 2, { superset: 'A' }), row('d', 'Squat', 3), row('e', 'Plank', 4)];
  expect(alignedOrder(mine, reference)).toEqual(['a', 'd', 'b', 'c', 'e']);
  expect(alignedOrder(mine, [])).toEqual(['a', 'b', 'c', 'd', 'e']);
  expect(alignedOrder([], reference)).toEqual([]);
});

it('fotografa la seduta contando solo le serie di lavoro', () => {
  const d = seed(), ex = d.exercises[0];
  d.workouts.push({ id: 'w', userId: 'local', planId: 'p', dayId: 'd', planName: 'P', dayName: 'D', date: '2026-11-13', startedAt: '2026-11-13T10:00:00.000Z', duration: 0, notes: '', status: 'draft' });
  d.workoutExercises.push({ id: 'we', workoutId: 'w', exerciseId: ex.id, name: ex.name, loadMode: ex.loadMode, order: 5, rest: 120, notes: '', repsMin: 6, repsMax: 8, superset: 'A' });
  d.sets.push({ id: 's0', workoutExerciseId: 'we', number: 1, kind: 'warmup', weight: 20, reps: 10, completed: true }, { id: 's1', workoutExerciseId: 'we', number: 2, kind: 'work', weight: 60, reps: 8, completed: true }, { id: 's2', workoutExerciseId: 'we', number: 3, kind: 'work', weight: 62.5, reps: 7, completed: true }, { id: 's3', workoutExerciseId: 'we', number: 4, kind: 'work', weight: 62.5, reps: 6, completed: false });
  const [item] = groupExercisesOf(d, 'w');
  expect(item).toMatchObject({ exerciseId: ex.id, order: 0, sets: 3, warmupSets: 1, repsMin: 6, repsMax: 8, rest: 120, superset: 'A', done: 2, total: 3, last: { weight: 62.5, reps: 7 }, muscleGroupId: ex.muscleGroupId });
  expect(memberProgress({ exercises: [item, { ...item, done: 1, total: 4 }] })).toEqual({ done: 3, total: 7 });
});

it('riusa l’esercizio già presente e aggiunge al catalogo personale solo quelli mancanti', () => {
  const d = seed(), known = d.exercises[0], before = d.exercises.length;
  expect(ensureGroupExercise(d, shared(known.id, 'Altro nome'))).toBe(known);
  expect(ensureGroupExercise(d, shared('id-diverso', known.name.toUpperCase()))).toBe(known);
  const created = ensureGroupExercise(d, shared('amico-1', 'Esercizio inventato', { muscleGroupId: 'gruppo-nuovo', muscleGroupName: 'Gruppo nuovo', loadMode: 'bodyweight' }));
  expect(d.exercises).toHaveLength(before + 1);
  expect(created).toMatchObject({ id: 'amico-1', name: 'Esercizio inventato', loadMode: 'bodyweight', muscleGroupId: 'gruppo-nuovo', active: true });
  expect(d.muscleGroups.some(g => g.id === 'gruppo-nuovo' && g.name === 'Gruppo nuovo')).toBe(true);
});
