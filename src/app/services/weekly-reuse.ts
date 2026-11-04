import { DataSet, MachineSetup, TrainingPlanExercise, WorkoutLog, WorkoutLogSet, localDate } from '../models/domain';
import { hasSetup, setupKey } from './training-flow';

/** A previous week of this training slot, never another plan or a future log. */
export function previousWeekWorkout(data: DataSet, dayId: string, date: string): WorkoutLog | undefined {
  const day = data.days.find(row => row.id === dayId);
  if (!day) return;
  let sourceIds: Set<string>, from = '', until = '';
  if (day.week !== undefined) {
    if (day.week <= 1) return;
    const ordered = data.days.filter(row => row.planId === day.planId).sort((a, b) => a.order - b.order);
    const currentWeek = ordered.filter(row => row.week === day.week);
    const priorWeek = ordered.filter(row => row.week === day.week! - 1);
    const currentSlot = day.weekday === undefined ? currentWeek : currentWeek.filter(row => row.weekday === day.weekday);
    const priorSlot = day.weekday === undefined ? priorWeek : priorWeek.filter(row => row.weekday === day.weekday);
    const source = priorSlot[currentSlot.findIndex(row => row.id === day.id)];
    if (!source) return;
    sourceIds = new Set([source.id]);
  } else {
    const start = new Date(date + 'T12:00:00');
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    const end = new Date(start); end.setDate(end.getDate() - 1);
    start.setDate(start.getDate() - 7);
    from = localDate(start); until = localDate(end);
    sourceIds = new Set([day.id]);
  }
  const entries = data.planExercises.filter(row => row.dayId === dayId);
  return data.workouts.filter(row => row.status === 'completed' && row.planId === day.planId && sourceIds.has(row.dayId) && row.date <= date && (!from || row.date >= from && row.date <= until))
    .sort((a, b) => b.date.localeCompare(a.date) || b.startedAt.localeCompare(a.startedAt))
    .find(workout => entries.some(entry => {
      const setup = data.exercisePreferences.find(row => row.id === entry.exerciseId)?.machineSetup;
      const prior = reusableExerciseSets(data, workout, entry, setup);
      return prior.work.length > 0 || prior.warmup.length > 0;
    }));
}

export function reusableExerciseSets(data: DataSet, workout: WorkoutLog, entry: TrainingPlanExercise, setup?: MachineSetup): {work: WorkoutLogSet[]; warmup: WorkoutLogSet[]} {
  const mode = data.exercises.find(row => row.id === entry.exerciseId)?.loadMode;
  const occurrence = data.planExercises.filter(row => row.dayId === entry.dayId && row.exerciseId === entry.exerciseId).sort((a, b) => a.order - b.order).findIndex(row => row.id === entry.id);
  const source = data.workoutExercises.filter(row => row.workoutId === workout.id && row.exerciseId === entry.exerciseId && row.loadMode === mode)
    .sort((a, b) => a.order - b.order)[Math.max(0, occurrence)];
  if (!source || hasSetup(setup) && setupKey(source.machineSetup) !== setupKey(setup)) return {work: [], warmup: []};
  const sets = data.sets.filter(row => row.workoutExerciseId === source.id && row.completed).sort((a, b) => a.number - b.number);
  return {work: sets.filter(row => row.kind !== 'warmup'), warmup: sets.filter(row => row.kind === 'warmup')};
}
