import {DataSet} from '../models/domain';
export interface HistoryIntent {workouts: string[]; sets: string[]}
export function historyReductions(before: DataSet, after: DataSet): HistoryIntent {
  return {
    workouts: before.workouts.filter(row => row.status === 'completed' && !after.workouts.some(next => next.id === row.id && next.status === 'completed')).map(row => row.id),
    sets: before.sets.filter(row => row.completed && !after.sets.some(next => next.id === row.id && next.completed)).map(row => row.id),
  };
}

export function workoutGraph(data: DataSet, id: string) {
  const workout = data.workouts.find(row => row.id === id);
  const exercises = data.workoutExercises.filter(row => row.workoutId === id).sort((a, b) => a.id.localeCompare(b.id));
  const ids = new Set(exercises.map(row => row.id));
  const sets = data.sets.filter(row => ids.has(row.workoutExerciseId)).sort((a, b) => a.id.localeCompare(b.id));
  return {workout, exercises, sets};
}
export function workoutSignature(data: DataSet, id: string): string {
  const canonical = (value: any): any => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort(([a],[b]) => a.localeCompare(b)).map(([key,item]) => [key,canonical(item)])) : value;
  return JSON.stringify(canonical(workoutGraph(data, id)));
}

/** A background restore may add history, but cannot silently undo recorded work. */
export function losesRecordedWork(local: DataSet, remote: DataSet): boolean {
  return local.workouts.some(workout => {
    const before = workoutGraph(local, workout.id), after = workoutGraph(remote, workout.id);
    if (workout.status === 'completed' && after.workout?.status !== 'completed') return true;
    return before.sets.some(set => set.completed && !after.sets.some(row => row.id === set.id && row.completed && row.weight === set.weight && row.reps === set.reps));
  });
}

/** Restore one selected snapshot while leaving every other workout and plan intact. */
export function recoverWorkout(current: DataSet, source: DataSet, workoutId: string): DataSet {
  const original = workoutGraph(source, workoutId);
  if (!original.workout || original.workout.status !== 'completed' && !original.sets.some(row => row.completed)) throw Error('La copia non contiene una seduta conclusa o serie registrate per questo allenamento.');
  const next = structuredClone(current), existing = workoutGraph(current, workoutId);
  const sourceIds = new Set(original.exercises.map(row => row.id));
  if (next.workoutExercises.some(row => sourceIds.has(row.id) && row.workoutId !== workoutId)) throw Error('I riferimenti della seduta appartengono a un altro allenamento. Nessun dato è stato modificato.');
  const originalSetIds = new Set(original.sets.map(row => row.id));
  if (next.sets.some(row => originalSetIds.has(row.id) && !sourceIds.has(row.workoutExerciseId))) throw Error('I riferimenti delle serie sono cambiati. Nessun dato è stato modificato.');
  const extraExercises = existing.exercises.filter(row => !sourceIds.has(row.id));
  const extraSets = existing.sets.filter(row => !originalSetIds.has(row.id));
  const exerciseIds = new Set(existing.exercises.map(row => row.id));
  next.workouts = next.workouts.filter(row => row.id !== workoutId).concat(structuredClone(original.workout));
  next.workoutExercises = next.workoutExercises.filter(row => row.workoutId !== workoutId).concat(structuredClone(original.exercises), extraExercises);
  next.sets = next.sets.filter(row => !exerciseIds.has(row.workoutExerciseId)).concat(structuredClone(original.sets), extraSets);
  for (const exercise of next.workoutExercises.filter(row => row.workoutId === workoutId)) {
    next.sets.filter(row => row.workoutExerciseId === exercise.id).sort((a, b) => a.number - b.number).forEach((row, index) => row.number = index + 1);
  }
  if (original.workout.status === 'completed') next.workoutUi = next.workoutUi.filter(row => row.id !== workoutId);
  else if (next.workouts.filter(row => row.status === 'draft').length > 1) throw Error('Concludi la seduta aperta prima di recuperare una sessione ancora in corso.');
  for (const event of source.scheduledWorkouts.filter(row => row.workoutId === workoutId)) {
    const present = next.scheduledWorkouts.find(row => row.id === event.id);
    if (!present) next.scheduledWorkouts.push(structuredClone(event));
    else if (!present.workoutId || present.workoutId === workoutId) present.workoutId = workoutId;
  }
  return next;
}
