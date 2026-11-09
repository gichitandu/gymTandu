import { DataSet, WellnessLog } from "../models/domain";
export function validWellness(row: WellnessLog): boolean {
  const date = row?.date,
    d = typeof date === "string" ? new Date(date + "T12:00:00Z") : null;
  return (
    !!row &&
    typeof row.id === "string" &&
    row.id.length > 0 &&
    row.id.length <= 150 &&
    !!d &&
    Number.isFinite(d.getTime()) &&
    d.toISOString().slice(0, 10) === date &&
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    [row.sleepMinutes].every(
      (v) => v === undefined || (Number.isInteger(v) && v >= 0 && v <= 1440),
    ) &&
    [row.sleepQuality, row.energy, row.stress].every(
      (v) => v === undefined || (Number.isInteger(v) && v >= 1 && v <= 5),
    ) &&
    !!row.soreness &&
    typeof row.soreness === "object" &&
    !Array.isArray(row.soreness) &&
    Object.keys(row.soreness).length <= 1000 &&
    Object.entries(row.soreness).every(
      ([id, v]) =>
        id.length > 0 &&
        id.length <= 150 &&
        Number.isInteger(v) &&
        v >= 0 &&
        v <= 4,
    ) &&
    typeof row.notes === "string" &&
    row.notes.length <= 2000
  );
}
export interface MuscleWork {
  id: string;
  name: string;
  sets: number;
  volume: number;
  lastDate: string;
}
/** Primary muscle only. Historical missing catalog references stay unassigned. */
export function muscleWork(
  data: DataSet,
  from: string,
  to: string,
): MuscleWork[] {
  const workouts = new Map(
    data.workouts
      .filter((w) => w.status === "completed" && w.date >= from && w.date <= to)
      .map((w) => [w.id, w]),
  );
  const catalog = new Map(data.exercises.map((e) => [e.id, e]));
  const rows = new Map(
    data.workoutExercises
      .filter((e) => workouts.has(e.workoutId))
      .map((e) => [e.id, e]),
  );
  const stats = new Map(
    data.muscleGroups.map((g) => [
      g.id,
      { id: g.id, name: g.name, sets: 0, volume: 0, lastDate: "" },
    ]),
  );
  for (const set of data.sets) {
    const row = rows.get(set.workoutExerciseId);
    if (!row || !set.completed || set.kind === "warmup") continue;
    const id = catalog.get(row.exerciseId)?.muscleGroupId || "unmapped";
    let group = stats.get(id);
    if (!group) {
      group = { id, name: "Non assegnato", sets: 0, volume: 0, lastDate: "" };
      stats.set(id, group);
    }
    group.sets++;
    if (
      row.loadMode === "external" &&
      !/da verificare|da confermare|sconosciut|unknown/i.test(
        row.loadUnit || "",
      )
    )
      group.volume += set.weight * set.reps;
    const date = workouts.get(row.workoutId)!.date;
    if (date > group.lastDate) group.lastDate = date;
  }
  return [...stats.values()].sort(
    (a, b) => b.sets - a.sets || a.name.localeCompare(b.name),
  );
}
export function sleepLabel(minutes: number | undefined) {
  return minutes === undefined
    ? "—"
    : Math.floor(minutes / 60) +
        " h " +
        String(minutes % 60).padStart(2, "0") +
        " m";
}
