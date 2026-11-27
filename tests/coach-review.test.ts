import { describe, expect, it } from "vitest";
import { coachSessionReview } from "../src/app/services/coach-review";
import { annotateSetNotes } from "../src/app/services/coach-expert-adapter";
import type { DataSet } from "../src/app/models/domain";

// Dati sintetici: nessun allenamento reale.
type SetRow = { weight: number; reps: number; rpe?: number; notes?: string; kind?: "work" | "warmup"; completed?: boolean };
function dataset(rows: { id: string; exerciseId: string; name: string; sets: SetRow[]; repsMin?: number; repsMax?: number }[], extra: Partial<DataSet> = {}) {
  return {
    muscleGroups: [{ id: "chest", name: "Petto" }, { id: "shoulders", name: "Spalle" }, { id: "triceps", name: "Tricipiti" }, { id: "back", name: "Schiena" }],
    exercises: [
      { id: "bench", name: "Panca piana", muscleGroupId: "chest", secondaryMuscleIds: ["shoulders", "triceps"] },
      { id: "fly", name: "Croci ai cavi", muscleGroupId: "chest" },
      { id: "row", name: "Rematore", muscleGroupId: "back" },
    ],
    workouts: [{ id: "w", date: "2026-03-10", status: "completed", startedAt: "2026-03-10T10:00:00Z" }, ...(extra.workouts ?? [])],
    workoutExercises: [
      ...rows.map((row, order) => ({ id: row.id, workoutId: "w", exerciseId: row.exerciseId, name: row.name, loadMode: "external", order, repsMin: row.repsMin ?? 8, repsMax: row.repsMax ?? 12 })),
      ...(extra.workoutExercises ?? []),
    ],
    sets: [
      ...rows.flatMap((row) => row.sets.map((set, index) => ({ id: row.id + index, workoutExerciseId: row.id, number: index + 1, completed: set.completed ?? true, kind: set.kind ?? "work", ...set }))),
      ...(extra.sets ?? []),
    ],
  } as unknown as DataSet;
}
const many = (count: number, set: SetRow) => Array.from({ length: count }, () => ({ ...set }));

describe("Valutazione del Coach a fine seduta", () => {
  it("non valuta allenamenti assenti, in bozza o senza serie allenanti", () => {
    expect(coachSessionReview(dataset([]), "w")).toBeNull();
    expect(coachSessionReview(dataset([{ id: "a", exerciseId: "bench", name: "Panca", sets: [{ weight: 40, reps: 10, kind: "warmup" }] }]), "w")).toBeNull();
    expect(coachSessionReview(dataset([{ id: "a", exerciseId: "bench", name: "Panca", sets: [{ weight: 60, reps: 10, rpe: 8 }] }]), "altro")).toBeNull();
  });

  it("riconosce uno sforzo ben dosato e conta le serie indirette a metà", () => {
    const review = coachSessionReview(dataset([{ id: "a", exerciseId: "bench", name: "Panca piana", sets: many(4, { weight: 60, reps: 10, rpe: 8 }) }]), "w")!;
    expect(review).toMatchObject({ workingSets: 4, declared: 4, effective: 4, easy: 0, failure: 0 });
    expect(review.insights.map((item) => item.title)).toContain("Sforzo ben dosato");
    expect(review.muscles).toEqual([
      { id: "chest", name: "Petto", session: 4, weekly: 4 },
      { id: "shoulders", name: "Spalle", session: 2, weekly: 2 },
      { id: "triceps", name: "Tricipiti", session: 2, weekly: 2 },
    ]);
  });

  it("segnala serie troppo facili e troppo cedimento", () => {
    const easy = coachSessionReview(dataset([{ id: "a", exerciseId: "fly", name: "Croci", sets: [...many(3, { weight: 20, reps: 12, rpe: 5 }), { weight: 20, reps: 12, rpe: 8 }] }]), "w")!;
    expect(easy.easy).toBe(3);
    expect(easy.insights.find((item) => item.title === "Serie troppo facili")).toMatchObject({ tone: "warn" });
    const failure = coachSessionReview(dataset([{ id: "a", exerciseId: "fly", name: "Croci", sets: [...many(3, { weight: 20, reps: 12, rpe: 10 }), { weight: 20, reps: 12, rpe: 8 }] }]), "w")!;
    expect(failure.failure).toBe(3);
    expect(failure.insights.find((item) => item.title === "Troppo cedimento")?.text).toContain("3 serie a cedimento su 4");
    expect(failure.insights.map((item) => item.title)).not.toContain("Sforzo ben dosato");
  });

  it("legge ripetizioni in riserva, tecnica e dolore dichiarati nelle note", () => {
    const pain = annotateSetNotes("", { technique: "good", pain: true, rir: 2 });
    const worse = annotateSetNotes("", { technique: "degraded", pain: false, rir: 1 });
    const review = coachSessionReview(dataset([{ id: "a", exerciseId: "bench", name: "Panca piana", sets: [{ weight: 60, reps: 10, notes: worse }, { weight: 60, reps: 8, notes: pain }] }]), "w")!;
    expect(review).toMatchObject({ declared: 2, effective: 2, pain: 1, degraded: 1 });
    expect(review.insights[0]).toMatchObject({ tone: "warn", title: "Dolore segnalato" });
    expect(review.insights[0].text).toContain("Panca piana");
    expect(review.insights[1].title).toBe("Tecnica da curare");
  });

  it("chiede di registrare lo sforzo quando manca in gran parte delle serie", () => {
    const review = coachSessionReview(dataset([{ id: "a", exerciseId: "bench", name: "Panca", sets: [...many(3, { weight: 60, reps: 10 }), { weight: 60, reps: 10, rpe: 8 }] }]), "w")!;
    expect(review.insights.find((item) => item.title === "Registra lo sforzo")?.text).toContain("1 serie su 4");
    expect(review.insights.at(-1)?.title).toBe("Seduta in linea");
  });

  it("collega il calo di ripetizioni tra le serie al recupero", () => {
    const review = coachSessionReview(dataset([{ id: "a", exerciseId: "bench", name: "Panca piana", repsMin: 6, repsMax: 10, sets: [{ weight: 80, reps: 10, rpe: 8 }, { weight: 80, reps: 8, rpe: 9 }, { weight: 80, reps: 6, rpe: 9 }] }]), "w")!;
    const drop = review.insights.find((item) => item.title === "Panca piana: calo tra le serie")!;
    expect(drop.text).toContain("Da 10 a 6 ripetizioni");
    expect(drop.text).toContain("3 min");
  });

  it("valuta il volume del muscolo nella seduta e negli ultimi 7 giorni", () => {
    const heavy = coachSessionReview(dataset([{ id: "a", exerciseId: "bench", name: "Panca", sets: many(6, { weight: 60, reps: 10, rpe: 8 }) }, { id: "b", exerciseId: "fly", name: "Croci", sets: many(6, { weight: 20, reps: 12, rpe: 8 }) }]), "w")!;
    expect(heavy.insights.find((item) => item.title === "Petto: tante serie in una seduta")?.text).toContain("12 serie oggi");
    const earlier = {
      workouts: [{ id: "x", date: "2026-03-07", status: "completed" }],
      workoutExercises: [{ id: "x1", workoutId: "x", exerciseId: "fly" }],
      sets: many(16, { weight: 20, reps: 12, rpe: 8 }).map((set, index) => ({ ...set, id: "x" + index, workoutExerciseId: "x1", completed: true, number: index + 1 })),
    } as unknown as Partial<DataSet>;
    const high = coachSessionReview(dataset([{ id: "a", exerciseId: "bench", name: "Panca", sets: many(6, { weight: 60, reps: 10, rpe: 8 }) }], earlier), "w")!;
    expect(high.insights.find((item) => item.title === "Petto: volume alto")?.text).toContain("22 serie negli ultimi 7 giorni");
    const low = coachSessionReview(dataset([{ id: "a", exerciseId: "row", name: "Rematore", sets: many(3, { weight: 50, reps: 10, rpe: 8 }) }]), "w")!;
    expect(low.insights.find((item) => item.title === "Schiena: volume basso")?.tone).toBe("info");
  });
});
