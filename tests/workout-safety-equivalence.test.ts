import { describe, expect, it } from "vitest";
import {
  historyReductions,
  losesRecordedWork,
} from "../src/app/services/workout-safety";

const make = (workouts: any[], exercises: any[], sets: any[]) =>
  ({ workouts, workoutExercises: exercises, sets }) as any;
const base = make(
  [
    { id: "w1", status: "completed" },
    { id: "w2", status: "draft" },
  ],
  [
    { id: "e1", workoutId: "w1" },
    { id: "e2", workoutId: "w2" },
  ],
  [
    { id: "s1", workoutExerciseId: "e1", completed: true, weight: 50, reps: 8 },
    { id: "s2", workoutExerciseId: "e2", completed: false, weight: 0, reps: 0 },
  ],
);

describe("workout-safety: controlli sulla storia", () => {
  it("copia identica o più ricca: nessuna perdita", () => {
    expect(losesRecordedWork(base, structuredClone(base))).toBe(false);
    const richer = structuredClone(base);
    richer.sets.push({
      id: "s3",
      workoutExerciseId: "e1",
      completed: true,
      weight: 55,
      reps: 5,
    });
    expect(losesRecordedWork(base, richer)).toBe(false);
  });
  it("serie mancante, modificata o non conclusa: perdita rilevata", () => {
    const missing = structuredClone(base);
    missing.sets = missing.sets.filter((s: any) => s.id !== "s1");
    const changed = structuredClone(base);
    changed.sets[0].reps = 7;
    const undone = structuredClone(base);
    undone.sets[0].completed = false;
    for (const remote of [missing, changed, undone])
      expect(losesRecordedWork(base, remote)).toBe(true);
  });
  it("allenamento concluso che torna bozza: perdita rilevata", () => {
    const remote = structuredClone(base);
    remote.workouts[0].status = "draft";
    expect(losesRecordedWork(base, remote)).toBe(true);
  });
  it("historyReductions elenca solo ciò che non è più concluso", () => {
    const after = structuredClone(base);
    after.workouts[0].status = "draft";
    after.sets[0].completed = false;
    expect(historyReductions(base, after)).toEqual({
      workouts: ["w1"],
      sets: ["s1"],
    });
    expect(historyReductions(base, structuredClone(base))).toEqual({
      workouts: [],
      sets: [],
    });
  });
});
