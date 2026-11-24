import { describe, expect, it } from "vitest";
import {
  coachHistory,
  coachNextSession,
  coachNextSet,
  coachPulse,
  coachRestSeconds,
  weeklyMuscleSets,
  daysBetween,
  estimate1rm,
  isCompoundExercise,
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
      row("setup-row", "other-setup", { machineSetup: { machine: "Altra macchina", seat: "4" } }),
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

  it("restituisce solo sedute precedenti, completate e sulla stessa macchina", () => {
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

describe("Coach Ombra con il riscontro sulla serie", () => {
  it("con dolore segnalato oggi dice di fermarsi", () => {
    expect(
      coachNextSet({ ...base, done: [{ weight: 60, reps: 10, rpe: 7, pain: true }] }),
    ).toMatchObject({ action: "stop", basis: "session" });
  });

  it("con tecnica peggiorata nell'ultima serie dice di fermarsi", () => {
    expect(
      coachNextSet({ ...base, done: [{ weight: 60, reps: 10, technique: "degraded" }] }),
    ).toMatchObject({ action: "stop" });
  });

  it("usa le ripetizioni in riserva quando manca l'RPE", () => {
    expect(
      coachNextSet({ ...base, done: [{ weight: 60, reps: 12, rir: 3, technique: "good" }] }),
    ).toMatchObject({ action: "raise", weight: 62.5, reps: 10 });
    // Serie al limite (RIR 0): stesso carico, anche una ripetizione in meno va bene.
    expect(
      coachNextSet({ ...base, done: [{ weight: 60, reps: 10, rir: 0 }] }),
    ).toMatchObject({ action: "hold", weight: 60, reps: 9 });
  });

  it("l'RPE indicato prevale sulle ripetizioni in riserva", () => {
    expect(
      coachNextSet({ ...base, done: [{ weight: 60, reps: 12, rpe: 9.5, rir: 4 }] }),
    ).toMatchObject({ action: "hold", weight: 60 });
  });

  it("aumenta dal riferimento anche con solo RIR dichiarati", () => {
    const reference = [{ weight: 50, reps: 12, rir: 2 }, { weight: 50, reps: 12, rir: 3 }];
    expect(coachNextSet({ ...base, reference, done: [] })).toMatchObject({ action: "raise", weight: 52.5 });
  });

  it("non aumenta se l'ultima volta c'era dolore o tecnica peggiorata", () => {
    const easy = { weight: 50, reps: 12, rpe: 7 };
    expect(coachNextSet({ ...base, reference: [easy, { ...easy, pain: true }], done: [] })).toMatchObject({ action: "hold", weight: 50 });
    expect(coachNextSet({ ...base, reference: [easy, { ...easy, technique: "degraded" as const }], done: [] })).toMatchObject({ action: "hold", weight: 50 });
  });
});

describe("Coach Ombra: alternative, recupero, andamento e volume", () => {
  it("offre alternative di pari sforzo e quella più pesante solo con dati completi", () => {
    const hold = coachNextSet({ ...base, reference: sets(60, [10, 9, 8], 8), done: [] })!;
    expect(hold).toMatchObject({ action: "hold", weight: 60, reps: 11 });
    expect(hold.options).toEqual([
      { kind: "easier", label: "Più leggero", weight: 57.5, reps: 12 },
      { kind: "harder", label: "Più pesante", weight: 62.5, reps: 9 },
    ]);
    // Senza RPE il Coach non propone di salire, nemmeno come alternativa.
    const blind = coachNextSet({ ...base, reference: [{ weight: 60, reps: 10 }], done: [] })!;
    expect(blind.options.map((option) => option.kind)).toEqual(["easier"]);
    // Dopo un aumento l'alternativa prudente è restare vicino al carico precedente.
    const raise = coachNextSet({ ...base, reference: sets(60, [12, 12, 12], 8), done: [] })!;
    expect(raise.options).toEqual([{ kind: "easier", label: "Più leggero", weight: 60, reps: 12 }]);
  });

  it("non offre alternative più pesanti con fatica, dolore o corpo libero", () => {
    const tired = coachNextSet({ ...base, readiness: "low", reference: sets(60, [10, 9, 8], 8), done: [] })!;
    expect(tired.options.some((option) => option.kind === "harder")).toBe(false);
    const pain = coachNextSet({ ...base, reference: [{ weight: 60, reps: 10, rpe: 7, pain: true }], done: [] })!;
    expect(pain.flags).toContain("caution");
    expect(pain.options.some((option) => option.kind === "harder")).toBe(false);
    expect(coachNextSet({ ...base, done: [{ weight: 60, reps: 10, rpe: 8, pain: true }] })!.options).toEqual([]);
    expect(
      coachNextSet({ ...base, loadMode: "bodyweight", reference: sets(0, [10, 9, 8], 8), done: [] })!.options,
    ).toEqual([]);
  });

  it("consiglia più recupero solo se quello del piano è chiaramente breve", () => {
    expect(coachRestSeconds(8, 12, true)).toBe(120);
    expect(coachRestSeconds(8, 12)).toBe(90);
    expect(coachRestSeconds(3, 5, true)).toBe(240);
    expect(coachRestSeconds(15, 20)).toBe(60);
    const input = { ...base, reference: sets(60, [10, 9, 8], 8), done: [] };
    expect(coachNextSet({ ...input, compound: true, plannedRest: 60 })!.rest).toMatchObject({ seconds: 120 });
    expect(coachNextSet({ ...input, compound: true, plannedRest: 120 })!.rest).toBeUndefined();
    expect(coachNextSet({ ...input, plannedRest: 75 })!.rest).toBeUndefined();
    expect(coachNextSet(input)!.rest).toBeUndefined();
  });

  it("distingue multiarticolari e isolamento dal nome, poi dai muscoli secondari", () => {
    for (const name of ["Panca piana", "Leg press", "Rematore bilanciere", "Lat machine", "Squat", "Stacco rumeno", "Shoulder press"])
      expect(isCompoundExercise({ name }), name).toBe(true);
    for (const name of ["Curl manubri", "Leg extension", "Pushdown cavo", "Alzate laterali", "Croci ai cavi", "French press", "Leg curl seduto"])
      expect(isCompoundExercise({ name }), name).toBe(false);
    expect(isCompoundExercise({ name: "Esercizio personale", secondaryMuscleIds: ["a"] })).toBe(true);
    expect(isCompoundExercise({ name: "Esercizio personale" })).toBe(false);
    expect(isCompoundExercise(undefined)).toBe(false);
  });

  it("confronta le serie di oggi con le stesse serie della volta scorsa", () => {
    expect(coachPulse([], sets(60, [10], 8))).toBeUndefined();
    expect(coachPulse(sets(60, [11, 10]), sets(60, [10, 9, 8]))).toEqual({ tone: "up", text: "+2 rip. sulla volta scorsa" });
    expect(coachPulse(sets(60, [9]), sets(60, [10, 9]))).toMatchObject({ tone: "down" });
    expect(coachPulse(sets(60, [10]), sets(60, [10]))).toMatchObject({ tone: "same" });
    expect(coachPulse(sets(62.5, [10]), sets(60, [12]))).toEqual({ tone: "up", text: "Carico più alto della volta scorsa" });
    expect(coachPulse(sets(57.5, [12]), sets(60, [10]))).toMatchObject({ tone: "down" });
    expect(coachPulse([...sets(62.5, [10]), ...sets(57.5, [10])], sets(60, [10, 10]))).toBeUndefined();
    expect(coachPulse(sets(20, [10]), sets(25, [10]), "assisted")).toBeUndefined();
    const live = coachNextSet({ ...base, reference: sets(60, [10, 9, 8], 8), done: [{ weight: 60, reps: 11, rpe: 8 }] })!;
    expect(live.pulse).toEqual({ tone: "up", text: "+1 rip. sulla volta scorsa" });
  });

  it("riconosce il calo su tre sedute con sforzo alto e propone una seduta di scarico", () => {
    const suggestion = coachNextSet({
      ...base,
      reference: sets(60, [9, 8, 8], 9.5),
      history: [{ sets: sets(60, [10, 9, 8], 9) }, { sets: sets(60, [10, 10, 9], 9) }],
      done: [],
    })!;
    expect(suggestion).toMatchObject({ action: "lower", weight: 55, title: "Seduta di scarico" });
    expect(suggestion.flags).toContain("deload");
    expect(suggestion.options.some((option) => option.kind === "harder")).toBe(false);
  });

  it("riporta il volume settimanale del muscolo tra i dati usati", () => {
    const line = (weeklySets: number) =>
      coachNextSet({ ...base, reference: sets(60, [10], 8), done: [], weeklySets, muscleName: "Petto" })!
        .evidence.find((text) => text.startsWith("Petto"));
    expect(line(6)).toContain("6 serie allenanti negli ultimi 7 giorni · sotto le 10");
    expect(line(14)).toContain("fascia utile");
    expect(line(24)).toContain("volume alto");
    expect(line(0)).toBeUndefined();
  });

  it("conta le serie allenanti del muscolo negli ultimi 7 giorni", () => {
    const data = {
      exercises: [{ id: "bench", muscleGroupId: "chest" }, { id: "row", muscleGroupId: "back" }],
      workouts: [{ id: "old", date: "2026-03-01" }, { id: "recent", date: "2026-03-06" }, { id: "today", date: "2026-03-10" }],
      workoutExercises: [
        { id: "a", workoutId: "old", exerciseId: "bench" },
        { id: "b", workoutId: "recent", exerciseId: "bench" },
        { id: "c", workoutId: "today", exerciseId: "bench" },
        { id: "d", workoutId: "today", exerciseId: "row" },
      ],
      sets: [
        { workoutExerciseId: "a", completed: true },
        { workoutExerciseId: "b", completed: true },
        { workoutExerciseId: "b", completed: true, kind: "warmup" },
        { workoutExerciseId: "c", completed: true },
        { workoutExerciseId: "c", completed: false },
        { workoutExerciseId: "d", completed: true },
      ],
    } as unknown as DataSet;
    expect(weeklyMuscleSets(data, "chest", "2026-03-10")).toBe(2);
    expect(weeklyMuscleSets(data, "back", "2026-03-10")).toBe(1);
    expect(weeklyMuscleSets(data, "", "2026-03-10")).toBe(0);
  });
});

describe("Coach Ombra · ragionamento sui carichi", () => {
  const rpeSets = (pairs: [number, number, number][]) => pairs.map(([weight, reps, rpe]) => ({ weight, reps, rpe }));

  it("sui carichi alti calcola l'aumento dal massimale stimato, con un tetto più ampio per i multiarticolari", () => {
    // 200 kg × 12 a RPE 7 → massimale ≈ 300 kg; 9 ripetizioni a RPE 8 ≈ 219,5 kg.
    const compound = coachNextSet({ ...base, compound: true, reference: sets(200, [12, 12, 12], 7), done: [] });
    expect(compound).toMatchObject({ action: "raise", weight: 215, reps: 9 });
    expect(compound!.reason).toContain("circa +8%");
    const isolation = coachNextSet({ ...base, reference: sets(200, [12, 12, 12], 7), done: [] });
    expect(isolation).toMatchObject({ action: "raise", weight: 210 });
    // Sui carichi bassi resta il singolo scatto: il tetto non scende mai sotto la regola semplice.
    expect(coachNextSet({ ...base, compound: true, reference: sets(60, [12, 12, 12], 8), done: [] })).toMatchObject({ weight: 62.5 });
  });

  it("in seduta sale in proporzione al carico, entro il 5%", () => {
    const suggestion = coachNextSet({ ...base, compound: true, done: [{ weight: 200, reps: 12, rpe: 6 }] });
    expect(suggestion).toMatchObject({ action: "raise", weight: 210, basis: "session" });
    expect(suggestion!.reps).toBeGreaterThanOrEqual(8);
  });

  it("oltre 12 ripetizioni sale di un solo passo e lo spiega", () => {
    const suggestion = coachNextSet({ repsMin: 12, repsMax: 15, incrementKg: 2.5, reference: sets(20, [15, 15, 15], 6), done: [] });
    expect(suggestion).toMatchObject({ action: "raise", weight: 22.5 });
    expect(suggestion!.evidence.join(" ")).toContain("Oltre 12 ripetizioni");
  });

  it("mostra l'andamento del massimale stimato tra le sedute", () => {
    const suggestion = coachNextSet({ ...base, reference: sets(60, [10, 10, 10], 8), history: [{ sets: sets(60, [9, 9, 9], 8) }], done: [] });
    expect(suggestion!.evidence.join(" ")).toContain("Massimale stimato: 84 kg · +2% rispetto a una seduta fa");
  });

  it("con il massimale fermo da quattro sedute propone di cambiare stimolo, anche se il carico cambia", () => {
    const suggestion = coachNextSet({
      ...base,
      reference: sets(60, [10, 10, 10], 8),
      history: [{ sets: sets(62.5, [9, 9, 9], 8) }, { sets: sets(65, [8, 8, 8], 8) }, { sets: sets(60, [10, 10, 10], 8) }],
      done: [],
    });
    expect(suggestion).toMatchObject({ action: "hold", weight: 60, title: "Cambia stimolo" });
    expect(suggestion!.flags).toContain("stall");
  });

  it("con il massimale in calo e sforzo alto propone una seduta di scarico", () => {
    const suggestion = coachNextSet({
      ...base,
      reference: sets(60, [8, 8, 8], 9),
      history: [{ sets: sets(62.5, [10, 10, 10], 8) }, { sets: sets(65, [8, 8, 8], 8) }, { sets: sets(62.5, [10, 10, 10], 8) }],
      done: [],
    });
    expect(suggestion).toMatchObject({ action: "lower", weight: 55, title: "Seduta di scarico" });
    expect(suggestion!.flags).toContain("deload");
  });

  it("con un calo marcato tra le serie chiede più recupero prima di salire", () => {
    const suggestion = coachNextSet({ ...base, reference: rpeSets([[60, 12, 8], [60, 9, 9], [60, 8, 9]]), done: [] });
    expect(suggestion).toMatchObject({ action: "hold", weight: 60, title: "Più recupero, poi sali", restBonus: 30 });
    expect(suggestion!.reason).toContain("da 12 a 8 ripetizioni");
    // Un calo normale vicino al cedimento (12 → 10) non basta.
    expect(coachNextSet({ ...base, reference: rpeSets([[60, 12, 8], [60, 11, 9], [60, 10, 9]]), done: [] })!.title).not.toBe("Più recupero, poi sali");
  });
});

describe("Coach Ombra · storico completo, corpo libero, schema e record", () => {
  it("legge ripetizioni in riserva, tecnica e dolore salvati nelle serie passate", async () => {
    const { annotateSetNotes } = await import("../src/app/services/coach-expert-adapter");
    const { coachSetFromLog } = await import("../src/app/services/coach-shadow");
    const notes = annotateSetNotes("Buona", { technique: "good", pain: false, rir: 2 });
    expect(coachSetFromLog({ weight: 60, reps: 10, notes })).toEqual({ weight: 60, reps: 10, rir: 2, technique: "good", pain: false });
    expect(coachSetFromLog({ weight: 60, reps: 10, rpe: 8 })).toEqual({ weight: 60, reps: 10, rpe: 8 });
    // Con il solo margine dichiarato (senza RPE) l'andamento del massimale ora c'è.
    const withRir = (weight: number, reps: number) => [0, 1, 2].map(() => ({ weight, reps, rir: 2 }));
    const suggestion = coachNextSet({ ...base, reference: withRir(60, 10), history: [{ sets: withRir(60, 9) }], done: [] });
    expect(suggestion!.evidence.join(" ")).toContain("Massimale stimato: 84 kg · +2%");
  });

  it("con zavorra e assistenza ragiona sul carico effettivo, peso corporeo compreso", () => {
    // Dip: 80 kg di corpo + 10 kg di zavorra = 90 kg × 12 a RPE 7.
    const weighted = coachNextSet({ ...base, compound: true, loadMode: "weighted-bodyweight", bodyWeight: 80, reference: sets(10, [12, 12, 12], 7), done: [] });
    expect(weighted).toMatchObject({ action: "raise", weight: 15, reps: 10 });
    expect(weighted!.evidence.join(" ")).toContain("peso corporeo compreso");
    expect(weighted!.estimated1rm).toBeUndefined();
    // Senza peso corporeo resta la regola semplice.
    expect(coachNextSet({ ...base, loadMode: "weighted-bodyweight", reference: sets(10, [12, 12, 12], 7), done: [] })).toMatchObject({ weight: 12.5, reps: 8 });
    // Trazioni assistite: 80 kg − 30 kg di assistenza = 50 kg effettivi.
    const assisted = coachNextSet({ ...base, loadMode: "assisted", bodyWeight: 80, reference: sets(30, [12, 12, 12], 7), done: [] });
    expect(assisted).toMatchObject({ action: "raise", weight: 27.5, reps: 10, title: "Riduci l'assistenza" });
  });

  it("per la prossima seduta propone carico e ripetizioni di ogni serie", () => {
    const next = coachNextSession({ ...base, completed: sets(60, [10, 9, 9], 8) })!;
    expect(next.sets).toEqual([{ weight: 60, reps: 11 }, { weight: 60, reps: 10 }, { weight: 60, reps: 10 }]);
    expect(next.weight).toBe(60);
    expect(next.reps).toBe(11);
  });

  it("riconosce un nuovo massimale stimato solo con almeno due sedute precedenti", () => {
    const live = coachNextSet({ ...base, reference: sets(60, [10], 8), history: [{ sets: sets(60, [9], 8) }], done: [{ weight: 60, reps: 12, rpe: 8 }] })!;
    expect(live.record).toBe(5);
    expect(live.pulse).toEqual({ tone: "up", text: "+2 rip. sulla volta scorsa · nuovo massimale stimato (+5%)" });
    expect(live.evidence.join(" ")).toContain("Nuovo massimale stimato: 88 kg, +5% sul miglior valore precedente");
    // Con una sola seduta precedente è solo un confronto.
    expect(coachNextSet({ ...base, reference: sets(60, [10], 8), done: [{ weight: 60, reps: 12, rpe: 8 }] })!.record).toBeUndefined();
    // Nel riepilogo il record apre il consiglio per la prossima volta.
    const summary = coachNextSession({ ...base, completed: sets(60, [12, 12], 8), history: [{ sets: sets(60, [10, 10], 8) }, { sets: sets(60, [9, 9], 8) }] })!;
    expect(summary.reason.startsWith("Nuovo massimale stimato (+5%).")).toBe(true);
  });
});
