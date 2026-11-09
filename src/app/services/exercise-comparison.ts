import { DataSet, WorkoutLogExercise } from "../models/domain";
import { setupKey } from "./training-flow";
export function exerciseComparison(data: DataSet, current: WorkoutLogExercise) {
  const active = data.workouts.find((w) => w.id === current.workoutId);
  if (!active) return [];
  const sessions = data.workouts
    .filter(
      (w) =>
        w.status === "completed" &&
        w.id !== active.id &&
        (w.date < active.date ||
          (w.date === active.date &&
            Date.parse(w.startedAt) < Date.parse(active.startedAt))),
    )
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) || b.startedAt.localeCompare(a.startedAt),
    );
  return sessions
    .flatMap((workout) => {
      const entries = data.workoutExercises.filter(
        (e) =>
          e.workoutId === workout.id &&
          e.exerciseId === current.exerciseId &&
          e.loadMode === current.loadMode &&
          setupKey(e.machineSetup) === setupKey(current.machineSetup),
      );
      const ids = new Set(entries.map((e) => e.id));
      const sets = data.sets.filter(
        (s) =>
          ids.has(s.workoutExerciseId) && s.completed && s.kind !== "warmup",
      );
      return sets.length
        ? [
            {
              date: workout.date,
              weight: Math.max(...sets.map((s) => s.weight)),
              reps: sets.reduce((sum, s) => sum + s.reps, 0),
              volume: sets.reduce((sum, s) => sum + s.weight * s.reps, 0),
              sets: sets.length,
            },
          ]
        : [];
    })
    .slice(0, 3);
}
