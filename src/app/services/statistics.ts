import {setupKey} from "./training-flow";
import { DataSet, LoadMode, WorkoutLog, WorkoutLogSet, localDate } from "../models/domain";
export function epley(weight: number, reps: number): number {
  // Con una sola ripetizione il massimale stimato coincide con il carico sollevato.
  return weight > 0 && reps > 0 ? (reps === 1 ? weight : weight * (1 + reps / 30)) : 0;
}
/** Sposta di N mesi senza sforare a fine mese (31/03 − 1 mese = 28/02, non 03/03). */
export function shiftMonths(date: Date, delta: number): void {
  const day = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + delta);
  date.setDate(Math.min(day, new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()));
}
export function volume(sets: WorkoutLogSet[], mode: LoadMode): number {
  return mode === "external"
    ? sets.filter((s) => s.completed&&s.kind!=="warmup").reduce((v, s) => v + s.weight * s.reps, 0)
    : 0;
}
export function sessionVolume(data: DataSet, w: WorkoutLog): number {
  // One pass over the sets rather than a full scan for every exercise.
  // Preserves the historical definition: completed working sets, external load only.
  const ids=new Set(data.workoutExercises.filter(e=>e.workoutId===w.id&&e.loadMode==='external').map(e=>e.id));
  let total=0;
  for(const set of data.sets)if(ids.has(set.workoutExerciseId)&&set.completed&&set.kind!=='warmup')total+=set.weight*set.reps;
  return total;
}
export function exerciseRecords(data: DataSet, id: string,machine?:string) {
  const mode = data.exercises.find((e) => e.id === id)?.loadMode;
  const rows = data.workoutExercises.filter(
    (e) =>
      e.exerciseId === id &&
      (machine===undefined||setupKey(e.machineSetup)===machine) &&
      (!mode || e.loadMode === mode) &&
      data.workouts.some(
        (w) => w.id === e.workoutId && w.status === "completed",
      ),
  );
  const sets = rows.flatMap((e) =>
    data.sets.filter((s) => s.workoutExerciseId === e.id && s.completed&&s.kind!=="warmup"),
  );
  const external = rows
    .filter((e) => e.loadMode === "external")
    .flatMap((e) =>
      data.sets.filter((s) => s.workoutExerciseId === e.id && s.completed&&s.kind!=="warmup"),
    );
  return {
    maxWeight: Math.max(0, ...sets.map((s) => s.weight)),
    estimated1RM: Math.max(0, ...external.map((s) => epley(s.weight, s.reps))),
    maxReps: Math.max(0, ...sets.map((s) => s.reps)),
    maxVolume: Math.max(
      0,
      ...[...new Set(rows.map((e) => e.workoutId))].map((wid) =>
        rows
          .filter((e) => e.workoutId === wid)
          .reduce(
            (v, e) =>
              v +
              volume(
                data.sets.filter((s) => s.workoutExerciseId === e.id),
                e.loadMode,
              ),
            0,
          ),
      ),
    ),
    repsByWeight: Object.fromEntries(
      [...new Set(sets.map((s) => s.weight))].map((w) => [
        w,
        Math.max(...sets.filter((s) => s.weight === w).map((s) => s.reps)),
      ]),
    ),
  };
}
export type Metric = "weight" | "volume" | "rm" | "reps" | "weekly";
export interface ChartPeriod {
  today?: string;
  /** Calendar days including today; overrides the month filter when positive. */
  days?: number;
}
export function chartSeries(
  data: DataSet,
  id: string,
  planId: string,
  months: number,
  metric: Metric,
  machine?:string,
  options: ChartPeriod = {},
) {
  const today = options.today ?? localDate();
  const cutoffDate = new Date(today + "T12:00:00");
  const days = options.days;
  const hasDays = days !== undefined && Number.isFinite(days) && days > 0;
  if (hasDays) cutoffDate.setDate(cutoffDate.getDate() - days + 1);
  else if (months) shiftMonths(cutoffDate, -months);
  const cutoff = hasDays || months ? localDate(cutoffDate) : "";
  const logs = data.workouts
    .filter(
      (w) =>
        w.status === "completed" &&
        (!planId || w.planId === planId) &&
        (!cutoff || w.date >= cutoff) &&
        w.date <= today,
    )
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) || a.startedAt.localeCompare(b.startedAt),
    );
  if (metric === "weekly") {
    const weeks = new Map<string, number>();
    for (const w of logs) {
      const d = new Date(w.date + "T12:00:00");
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      const k = localDate(d);
      weeks.set(k, (weeks.get(k) || 0) + sessionVolume(data, w));
    }
    return [...weeks].map(([date, value]) => ({ date, value }));
  }
  return logs.flatMap((w) => {
    const entries = data.workoutExercises.filter(
      (e) =>
        e.workoutId === w.id &&
        e.exerciseId === id &&
      (machine===undefined||setupKey(e.machineSetup)===machine) &&
        e.loadMode ===
          (data.exercises.find((x) => x.id === id)?.loadMode ?? e.loadMode),
    );
    if (!entries.length) return [];
    const sets = entries.flatMap((e) =>
      data.sets.filter((s) => s.workoutExerciseId === e.id && s.completed&&s.kind!=="warmup"),
    );
    if (!sets.length) return [];
    if (
      metric === "weight" &&
      entries.every((e) => e.loadMode === "bodyweight")
    )
      return [];
    if (
      (metric === "volume" || metric === "rm") &&
      entries.some((e) => e.loadMode !== "external")
    )
      return [];
    const value =
      metric === "weight"
        ? Math.max(...sets.map((s) => s.weight))
        : metric === "reps"
          ? Math.max(...sets.map((s) => s.reps))
          : metric === "rm"
            ? Math.max(...sets.map((s) => epley(s.weight, s.reps)))
            : sets.reduce((v, s) => v + s.weight * s.reps, 0);
    return [{ date: w.date, value }];
  });
}
