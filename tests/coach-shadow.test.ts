import { describe, expect, it } from "vitest";
import {
  coachHistory,
  coachNextSession,
  coachNextSet,
  daysBetween,
  estimate1rm,
  readinessFromWellness,
} from "../src/app/services/coach-shadow";
import type { DataSet, WorkoutLogExercise } from "../src/app/models/domain";

const base = { repsMin: 8, repsMax: 12, incrementKg: 2.5 };
const sets = (weight: number, reps: number[], rpe?: number) =>
  reps.map((value) => ({ weight, reps: value, rpe }));

describe("Coach Ombra", () => {
  it("non suggerisce nulla con parametri non validi", () => {
    expect(coachNextSet({ ...base, repsMax: 5, done: [] })).toBeNull();
    expect(coachNextSet({ ...base, incrementKg: 0, done: [] })).toBeNull();
  });

  it("non inventa un riferimento senza storico né carico impostato", () => {
    expect(coachNextSet({ ...base, done: [] })).toBeNull();
    expect(coachNextSet({ ...base, done: [], plannedWeight: 40 })).toMatchObject(
      { action: "hold", weight: 40, basis: "none", confidence: "low" },
    );
  });

  it("propone un aumento se l'ultima volta era tutto a 12 con RPE fino a 8 e stima le ripetizioni", () => {
    const suggestion = coachNextSet({
      ...base,
      reference: sets(60, [12, 12, 12], 8),
      done: [],
    });
    expect(suggestion).toMatchObject({
      action: "raise",
      weight: 62.5,
      reps: 10,
      basis: "reference",
      title: "Sali di carico",
      confidence: "high",
    });
    expect(suggestion!.estimated1rm).toBeCloseTo(88);
    expect(suggestion!.evidence.join(" ")).toContain("Volta scorsa");
  });

  it("raddoppia l'incremento solo se tutte le serie erano molto facili", () => {
    expect(
      coachNextSet({ ...base, reference: sets(60, [12, 12, 12], 6), done: [] }),
    ).toMatchObject({ action: "raise", weight: 65 });
    expect(
      coachNextSet({ ...base, reference: sets(60, [12, 12, 12], 7), done: [] }),
    ).toMatchObject({ action: "raise", weight: 62.5 });
  });

  it("non aumenta senza RPE registrato nello storico", () => {
    const reference = [{ weight: 60, reps: 12 }];
    expect(coachNextSet({ ...base, reference, done: [] })).toMatchObject({
      action: "hold",
      weight: 60,
      confidence: "medium",
    });
  });

  it("non aumenta se il massimo è stato raggiunto con sforzo alto", () => {
    expect(
      coachNextSet({ ...base, reference: sets(60, [12, 12, 12], 9.5), done: [] }),
    ).toMatchObject({ action: "hold", weight: 60, reps: 12 });
  });

  it("usa l'obiettivo di sforzo del piano al posto di RPE 8", () => {
    const reference = sets(60, [12, 12, 12], 9);
    expect(coachNextSet({ ...base, reference, done: [] })).toMatchObject({
      action: "hold",
    });
    expect(
      coachNextSet({ ...base, reference, done: [], targetRpe: 9 }),
    ).toMatchObject({ action: "raise", weight: 62.5 });
  });

  it("con poco recupero tiene il carico anche se lo storico permetterebbe di salire", () => {
    const reference = [{ weight: 60, reps: 12, rpe: 7 }];
    const suggestion = coachNextSet({
      ...base,
      reference,
      done: [],
      readiness: "low",
    });
    expect(suggestion).toMatchObject({ action: "hold", weight: 60 });
    expect(suggestion!.flags).toContain("low-readiness");
  });

  it("con il muscolo indolenzito non propone aumenti", () => {
    const suggestion = coachNextSet({
      ...base,
      reference: sets(60, [12, 12, 12], 7),
      done: [],
      sore: true,
    });
    expect(suggestion).toMatchObject({ action: "hold", weight: 60 });
    expect(suggestion!.reason).toContain("indolenzito");
  });

  it("con ottimo recupero accetta mezzo punto di RPE in più per salire", () => {
    const reference = sets(60, [12, 12, 12], 8.5);
    expect(coachNextSet({ ...base, reference, done: [] })).toMatchObject({
      action: "hold",
    });
    expect(
      coachNextSet({ ...base, reference, done: [], readiness: "high" }),
    ).toMatchObject({ action: "raise", weight: 62.5 });
  });

  it("legge il riferimento serie per serie quando non c'è ancora nulla di fatto", () => {
    const reference = [
      { weight: 60, reps: 11, rpe: 8 },
      { weight: 60, reps: 9, rpe: 9 },
    ];
    expect(
      coachNextSet({ ...base, reference, done: [], setIndex: 0 }),
    ).toMatchObject({ action: "hold", weight: 60, reps: 12 });
    expect(
      coachNextSet({ ...base, reference, done: [], setIndex: 1 }),
    ).toMatchObject({ action: "hold", weight: 60, reps: 10 });
  });

  it("dopo una pausa lunga riparte più leggero, dopo tre settimane senza cercare aumenti", () => {
    const reference = sets(60, [12, 12, 12], 7);
    const long = coachNextSet({
      ...base,
      reference,
      done: [],
      daysSinceReference: 60,
    });
    expect(long).toMatchObject({
      action: "lower",
      weight: 55,
      reps: 8,
      title: "Rientro graduale",
      confidence: "low",
    });
    expect(long!.flags).toContain("layoff");
    expect(
      coachNextSet({ ...base, reference, done: [], daysSinceReference: 25 }),
    ).toMatchObject({ action: "hold", weight: 60, reps: 11 });
  });

  it("scende se l'ultima volta metà delle serie erano sotto il minimo", () => {
    expect(
      coachNextSet({ ...base, reference: sets(60, [8, 7, 6], 9.5), done: [] }),
    ).toMatchObject({ action: "lower", weight: 57.5, reps: 8 });
  });

  it("riconosce lo stallo su tre sedute e non lo confonde con un progresso", () => {
    const stalled = coachNextSet({
      ...base,
      reference: sets(60, [10, 9, 8], 9),
      history: [
        { sets: sets(60, [10, 9, 8], 9) },
        { sets: sets(60, [10, 9, 9], 9) },
      ],
      done: [],
    });
    expect(stalled).toMatchObject({
      action: "hold",
      weight: 60,
      reps: 11,
      title: "Sblocca lo stallo",
      restBonus: 30,
    });
    expect(stalled!.flags).toContain("stall");
    const improving = coachNextSet({
      ...base,
      reference: sets(60, [11, 10, 9], 8),
      history: [
        { sets: sets(60, [10, 9, 8], 8) },
        { sets: sets(60, [9, 9, 8], 8) },
      ],
      done: [],
    });
    expect(improving!.flags).not.toContain("stall");
  });

  it("non propone un salto troppo grande per l'intervallo di ripetizioni", () => {
    const suggestion = coachNextSet({
      repsMin: 10,
      repsMax: 12,
      incrementKg: 2,
      reference: sets(6, [12, 12, 12], 8),
      done: [],
    });
    expect(suggestion).toMatchObject({
      action: "hold",
      weight: 6,
      reps: 13,
      title: "Consolida prima del salto",
    });
    expect(suggestion!.flags).toContain("big-jump");
  });

  it("riadatta dopo ogni serie: facile al massimo, sale", () => {
    expect(
      coachNextSet({ ...base, done: [{ weight: 60, reps: 12, rpe: 6.5 }] }),
    ).toMatchObject({ action: "raise", weight: 62.5, reps: 10, basis: "session" });
  });

  it("riadatta dopo ogni serie: sotto il minimo, scende e allunga il recupero", () => {
    expect(
      coachNextSet({ ...base, done: [{ weight: 60, reps: 6, rpe: 9 }] }),
    ).toMatchObject({ action: "lower", weight: 57.5, restBonus: 30 });
    expect(
      coachNextSet({ ...base, done: [{ weight: 60, reps: 4, rpe: 10 }] }),
    ).toMatchObject({ action: "lower", weight: 55 });
  });

  it("serie al limite: mantiene il carico e accetta una ripetizione in meno", () => {
    expect(
      coachNextSet({ ...base, done: [{ weight: 60, reps: 10, rpe: 10 }] }),
    ).toMatchObject({ action: "hold", weight: 60, reps: 9, restBonus: 60 });
  });

  it("serie al limite già sul minimo: scende per restare nell'intervallo", () => {
    expect(
      coachNextSet({ ...base, done: [{ weight: 60, reps: 8, rpe: 10 }] }),
    ).toMatchObject({ action: "lower", weight: 57.5, reps: 8 });
  });

  it("serie dura con recupero basso: alleggerisce", () => {
    expect(
      coachNextSet({
        ...base,
        readiness: "low",
        done: [{ weight: 60, reps: 10, rpe: 9 }],
      }),
    ).toMatchObject({ action: "lower", weight: 57.5 });
  });

  it("senza RPE sale solo se le ripetizioni superano chiaramente il massimo", () => {
    expect(
      coachNextSet({ ...base, done: [{ weight: 60, reps: 12 }] }),
    ).toMatchObject({ action: "hold", weight: 60, confidence: "medium" });
    expect(
      coachNextSet({ ...base, done: [{ weight: 60, reps: 14 }] }),
    ).toMatchObject({ action: "raise", weight: 62.5, reps: 8 });
  });

  it("usa la serie più recente e ignora serie non valide", () => {
    expect(
      coachNextSet({
        ...base,
        done: [
          { weight: 60, reps: 10, rpe: 8 },
          { weight: Number.NaN, reps: 10 },
        ],
      }),
    ).toMatchObject({ weight: 60, reps: 11 });
  });

  it("il carico suggerito non scende sotto zero", () => {
    expect(
      coachNextSet({ ...base, done: [{ weight: 1, reps: 3, rpe: 10 }] })
        ?.weight,
    ).toBe(0);
  });

  it("a corpo libero lavora sulle ripetizioni e non propone carichi", () => {
    expect(
      coachNextSet({
        ...base,
        loadMode: "bodyweight",
        done: [{ weight: 0, reps: 10, rpe: 7 }],
      }),
    ).toMatchObject({ action: "hold", weight: 0, reps: 11 });
    expect(
      coachNextSet({
        ...base,
        loadMode: "bodyweight",
        reference: sets(0, [12, 12, 12], 7),
        done: [],
      }),
    ).toMatchObject({ action: "raise", weight: 0, reps: 13 });
    expect(
      coachNextSet({
        ...base,
        loadMode: "bodyweight",
        done: [{ weight: 0, reps: 5, rpe: 10 }],
      }),
    ).toMatchObject({ action: "hold", weight: 0, reps: 8 });
  });

  it("con l'assistenza progredire significa toglierne", () => {
    expect(
      coachNextSet({
        ...base,
        incrementKg: 5,
        loadMode: "assisted",
        reference: sets(30, [12, 12, 12], 8),
        done: [],
      }),
    ).toMatchObject({ action: "raise", weight: 25, title: "Riduci l'assistenza" });
    expect(
      coachNextSet({
        ...base,
        incrementKg: 5,
        loadMode: "assisted",
        done: [{ weight: 30, reps: 6, rpe: 10 }],
      }),
    ).toMatchObject({ action: "lower", weight: 35 });
  });

  it("scrive i carichi nell'unità indicata", () => {
    const suggestion = coachNextSet({
      ...base,
      reference: sets(60, [12, 12, 12], 8),
      done: [],
      formatWeight: (kg) => Math.round(kg * 2.2046226218) + " lb",
    });
    expect(suggestion!.reason).toContain("138 lb");
    expect(suggestion!.reason).not.toContain("kg");
  });

  it("consiglia la prossima seduta partendo dalle serie appena fatte", () => {
    const next = coachNextSession({
      ...base,
      completed: sets(60, [12, 12, 12], 8),
    });
    expect(next).toMatchObject({ action: "raise", weight: 62.5 });
    expect(next!.reason).toContain("Oggi");
    expect(next!.reason).toContain("la prossima volta");
    expect(coachNextSession({ ...base, completed: [] })).toBeNull();
  });
});

describe("massimale stimato", () => {
  it("conta le ripetizioni in riserva e rinuncia quando la stima non è affidabile", () => {
    expect(estimate1rm({ weight: 100, reps: 1, rpe: 10 })).toBe(100);
    expect(estimate1rm({ weight: 60, reps: 12, rpe: 8 })).toBeCloseTo(88);
    expect(estimate1rm({ weight: 0, reps: 10 })).toBeUndefined();
    expect(estimate1rm({ weight: 20, reps: 25, rpe: 8 })).toBeUndefined();
  });
});

describe("prontezza dal check-in", () => {
  it("è undefined senza dati utilizzabili", () => {
    expect(readinessFromWellness(null)).toBeUndefined();
    expect(readinessFromWellness({})).toBeUndefined();
  });
  it("riconosce poco recupero e tratta lo stress alto come negativo", () => {
    expect(
      readinessFromWellness({ sleepQuality: 2, energy: 2, stress: 4 }),
    ).toBe("low");
    expect(
      readinessFromWellness({ sleepQuality: 4, energy: 4, stress: 2 }),
    ).toBe("normal");
  });
  it("riconosce un ottimo recupero solo con almeno due dati e conta le ore di sonno", () => {
    expect(readinessFromWellness({ energy: 5 })).toBe("normal");
    expect(readinessFromWellness({ energy: 5, sleepMinutes: 500 })).toBe("high");
    expect(readinessFromWellness({ energy: 3, sleepMinutes: 240 })).toBe("low");
  });
});

describe("storico confrontabile", () => {
  const workout = (id: string, date: string, status = "completed") => ({
    id,
    userId: "local",
    planId: "p",
    dayId: "d",
    planName: "Piano",
    dayName: "Giorno",
    date,
    startedAt: date + "T10:00:00.000Z",
    duration: 0,
    notes: "",
    status,
  });
  const row = (id: string, workoutId: string, extra = {}) => ({
    id,
    workoutId,
    exerciseId: "bench",
    name: "Panca",
    loadMode: "external",
    order: 0,
    rest: 90,
    notes: "",
    ...extra,
  });
  const set = (id: string, rowId: string, number: number, extra = {}) => ({
    id,
    workoutExerciseId: rowId,
    number,
    weight: 60,
    reps: 10,
    completed: true,
    ...extra,
  });
  const data = {
    workouts: [
      workout("old", "2026-01-01"),
      workout("mid", "2026-01-08"),
      workout("other-setup", "2026-01-10"),
      workout("now", "2026-01-15", "draft"),
      workout("future", "2026-02-01"),
    ],
    workoutExercises: [
      row("old-row", "old"),
      row("mid-row", "mid"),
      row("setup-row", "other-setup", { machineSetup: { seat: "4" } }),
      row("now-row", "now"),
      row("future-row", "future"),
    ],
    sets: [
      set("o1", "old-row", 1),
      set("m2", "mid-row", 2, { reps: 9 }),
      set("m1", "mid-row", 1, { reps: 11, rpe: 8 }),
      set("mw", "mid-row", 0, { kind: "warmup", weight: 30 }),
      set("mx", "mid-row", 3, { completed: false }),
      set("s1", "setup-row", 1),
      set("f1", "future-row", 1),
    ],
  } as unknown as DataSet;
  const current = data.workoutExercises[3] as WorkoutLogExercise;

  it("restituisce solo sedute precedenti, completate e con la stessa configurazione", () => {
    const history = coachHistory(data, current);
    expect(history.map((session) => session.id)).toEqual(["mid-row", "old-row"]);
    expect(history[0].sets).toEqual([
      { weight: 60, reps: 11, rpe: 8 },
      { weight: 60, reps: 9, rpe: undefined },
    ]);
    expect(coachHistory(data, current, 1)).toHaveLength(1);
  });

  it("calcola i giorni tra due date locali", () => {
    expect(daysBetween("2026-01-08", "2026-01-15")).toBe(7);
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2);
    expect(daysBetween(undefined, "2026-01-15")).toBeUndefined();
    expect(daysBetween("non valida", "2026-01-15")).toBeUndefined();
  });
});
