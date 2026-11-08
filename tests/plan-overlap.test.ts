import { describe, expect, it } from "vitest";
import { seed } from "../src/app/core/seed";
import { planOverlaps } from "../src/app/services/plan-overlap";
import { DataSet } from "../src/app/models/domain";

const program = (startDate: string, endDate: string) =>
  ({ importId: "i", sourceName: "x.xlsx", sourceKind: "original", fileHash: "a".repeat(64), startDate, endDate, weeks: 8 }) as any;

function plan(data: DataSet, id: string, name: string, extra: any = {}) {
  data.plans.push({ id, userId: "local", name, description: "", createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z", active: false, archived: false, ...extra });
}
function done(data: DataSet, planId: string, n: number, date: string) {
  for (let i = 0; i < n; i++) {
    const id = `${planId}-w${i}`;
    data.workouts.push({ id, userId: "local", planId, dayId: "d", planName: "P", dayName: "D", date, startedAt: date + "T10:00:00.000Z", duration: 30, notes: "", status: "completed" });
    data.workoutExercises.push({ id: id + "e", workoutId: id, exerciseId: "x", name: "E", loadMode: "external", order: 0, rest: 60, notes: "" });
    data.sets.push({ id: id + "s", workoutExerciseId: id + "e", number: 1, weight: 10, reps: 10, completed: true });
  }
}

describe("piani sovrapposti", () => {
  it("propone di tenere il piano con più sedute", () => {
    const data = seed();
    plan(data, "a", "Programma", { program: program("2026-10-05", "2026-11-29") });
    plan(data, "b", "Recuperato", { program: program("2026-10-05", "2026-11-29") });
    done(data, "a", 3, "2026-10-20");
    done(data, "b", 1, "2026-10-21");
    const found = planOverlaps(data);
    expect(found).toHaveLength(1);
    expect(found[0].keep.plan.id).toBe("a");
    expect(found[0].drop.plan.id).toBe("b");
    expect(found[0].keep.workouts).toBe(3);
  });
  it("ignora piani senza date sovrapposte, archiviati o senza programma", () => {
    const data = seed();
    plan(data, "a", "Programma", { program: program("2026-10-05", "2026-11-29") });
    plan(data, "b", "Dopo", { program: program("2026-12-07", "2027-01-31") });
    plan(data, "c", "Archiviato", { archived: true, program: program("2026-10-05", "2026-11-29") });
    expect(planOverlaps(data)).toEqual([]);
    const free = seed();
    plan(free, "x", "Libero 1");
    plan(free, "y", "Libero 2");
    done(free, "x", 1, "2026-11-01");
    done(free, "y", 1, "2026-11-02");
    expect(planOverlaps(free)).toEqual([]);
  });
  it("rileva un piano libero con sedute dentro un programma e non modifica i dati", () => {
    const data = seed();
    plan(data, "p", "Programma", { program: program("2026-10-05", "2026-11-29") });
    plan(data, "f", "Libero");
    done(data, "f", 2, "2026-11-04");
    const before = JSON.stringify(data);
    expect(planOverlaps(data)).toHaveLength(1);
    expect(JSON.stringify(data)).toBe(before);
  });
});
