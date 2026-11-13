import { describe, expect, it } from "vitest";
import { seed } from "../src/app/core/seed";
import { DataSet, WorkoutLogSet } from "../src/app/models/domain";
import { COACH_CONFIG } from "../src/app/services/coach-config";
import {
  adviseSet, CoachExerciseProfile, CoachSessionResult, CoachSetResult, compareSessions, globalTrend,
  planExercise, resolvePrescription, resolveSettings, rirText, restText,
} from "../src/app/services/coach-engine";
import { adviceForSet, exerciseProfile, snapshotOf, trainingTrend, validCoachSnapshot, workoutGuides } from "../src/app/services/coach-data";
import { validateIntegrity } from "../src/app/services/integrity";

const barbell: CoachExerciseProfile = { loadMode: "external", movement: "compound", increment: 2.5, minLoad: 20, safeForFailure: false, dropsetCompatible: false };
const machine: CoachExerciseProfile = { loadMode: "external", movement: "isolation", increment: 2.5, minLoad: 5, safeForFailure: true, dropsetCompatible: true };
const plan = { sets: 3, repsMin: 8, repsMax: 10, rirMin: 2, rirMax: 2, rest: 120 };
const sets = (weight: number, reps: number[], rir?: number | (number | undefined)[], extra: Partial<CoachSetResult> = {}): CoachSetResult[] =>
  reps.map((r, i) => ({ weight, reps: r, rir: Array.isArray(rir) ? rir[i] : rir, ...extra }));
const session = (date: string, s: CoachSetResult[], extra: Partial<CoachSessionResult> = {}): CoachSessionResult => ({ date, sets: s, ...extra });
const intermediate = { experience: "intermediate" as const };

describe("Guida allenamento · prescrizione iniziale", () => {
  it("usa preset prudenti e configurabili quando mancano dati", () => {
    const settings = resolveSettings(undefined);
    expect(settings).toMatchObject({ goal: "hypertrophy", experience: "beginner", allowFailure: false, allowDropsets: false });
    const rx = resolvePrescription(settings, barbell, {});
    const preset = COACH_CONFIG.presets.hypertrophy.compound;
    expect(rx).toMatchObject({ sets: preset.sets, repsMin: preset.repsMin, repsMax: preset.repsMax, rest: preset.rest });
    // Principiante: un margine in più rispetto al preset.
    expect(rx.rirMin).toBe(preset.rir + 1);
    expect(rx.source).toEqual({ reps: "preset", rir: "preset", rest: "preset" });
  });

  it("distingue obiettivo e tipo di esercizio, e la scheda ha la precedenza", () => {
    const s = resolveSettings({ goal: "strength", experience: "advanced" });
    expect(resolvePrescription(s, barbell, {})).toMatchObject({ repsMin: 3, repsMax: 6, rest: 180 });
    expect(resolvePrescription(s, machine, {})).toMatchObject({ repsMin: 6, repsMax: 10 });
    expect(resolvePrescription(s, barbell, { sets: 5, repsMin: 5, repsMax: 5, rirMin: 1, rirMax: 2, rest: 240 }))
      .toMatchObject({ sets: 5, repsMin: 5, repsMax: 5, rirMin: 1, rirMax: 2, rest: 240, source: { reps: "plan", rir: "plan", rest: "plan" } });
    expect(resolvePrescription(s, barbell, { rpe: 8 })).toMatchObject({ rirMin: 2, rirMax: 2 });
  });

  it("senza storico propone una calibrazione e non inventa carichi o massimali", () => {
    const result = planExercise({ settings: intermediate, exercise: barbell, plan, history: [] });
    expect(result.decision).toBe("calibrate");
    expect(result.weight).toBeUndefined();
    expect(result.reason).toContain("scegli un carico");
    const withPlan = planExercise({ settings: intermediate, exercise: barbell, plan: { ...plan, plannedWeight: 60 }, history: [] });
    expect(withPlan).toMatchObject({ decision: "calibrate", weight: 60 });
    const advice = adviseSet(withPlan, barbell, 0, []);
    expect(advice.headline).toBe("Serie 1: 8–10 ripetizioni con 60 kg.");
    expect(advice.rirText).toBe("Fermati quando pensi di poter fare ancora 2 ripetizioni.");
    expect(advice.restText).toBe("Recupero: 2 minuti.");
  });

  it("in calibrazione corregge il carico dopo la prima serie", () => {
    const p = planExercise({ settings: intermediate, exercise: barbell, plan, history: [] });
    const easy = adviseSet(p, barbell, 1, [{ weight: 40, reps: 10, rir: 4 }]);
    expect(easy).toMatchObject({ change: "load-up", weight: 42.5, scope: "session" });
  });
});

describe("Guida allenamento · doppia progressione", () => {
  it("aumenta prima le ripetizioni allo stesso carico", () => {
    const result = planExercise({ settings: intermediate, exercise: barbell, plan, history: [session("2026-11-01", sets(40, [9, 8, 8], 2))] });
    expect(result).toMatchObject({ decision: "progress-reps", weight: 40, repTargets: [10, 9, 9] });
  });

  it("propone il minimo incremento quando tutte le serie raggiungono il limite superiore con il margine richiesto", () => {
    const result = planExercise({ settings: intermediate, exercise: barbell, plan, history: [session("2026-11-01", sets(40, [10, 10, 10], 2))] });
    expect(result).toMatchObject({ decision: "increase-load", weight: 42.5, repTargets: [8, 8, 8] });
    expect(result.reason).toContain("Oggi prova 42,5 kg");
    expect(result.reason).toContain("ripartire dalla parte bassa del range");
  });

  it("non aumenta se il margine o la tecnica richiesti non sono stati rispettati", () => {
    const atFailure = planExercise({ settings: intermediate, exercise: barbell, plan, history: [session("2026-11-01", sets(40, [10, 10, 10], 0))] });
    expect(atFailure.decision).not.toBe("increase-load");
    expect(atFailure.weight).toBe(40);
    const technique = planExercise({ settings: intermediate, exercise: barbell, plan, history: [session("2026-11-01", [...sets(40, [10, 10], 2), { weight: 40, reps: 10, rir: 2, flag: "technique" }])] });
    expect(technique.decision).not.toBe("increase-load");
  });

  it("senza RIR dichiarato chiede una seconda conferma invece di presumere il margine", () => {
    const once = planExercise({ settings: intermediate, exercise: barbell, plan, history: [session("2026-11-05", sets(40, [10, 10, 10]))] });
    expect(once).toMatchObject({ decision: "confirm-load", weight: 40 });
    const twice = planExercise({ settings: intermediate, exercise: barbell, plan, history: [session("2026-11-05", sets(40, [10, 10, 10])), session("2026-11-01", sets(40, [10, 10, 10]))] });
    expect(twice).toMatchObject({ decision: "increase-load", weight: 42.5 });
  });

  it("con incremento troppo grande mantiene il carico ed estende le ripetizioni", () => {
    const dumbbell: CoachExerciseProfile = { ...machine, increment: 2, minLoad: 0 };
    const p = { sets: 3, repsMin: 12, repsMax: 15, rirMin: 1, rirMax: 1, rest: 60 };
    const atTop = planExercise({ settings: intermediate, exercise: dumbbell, plan: p, history: [session("2026-11-01", sets(8, [15, 15, 15], 1))] });
    expect(atTop).toMatchObject({ decision: "extend-reps", weight: 8, topReps: 18 });
    expect(atTop.reason).toContain("supera il 10%");
    const extended = planExercise({ settings: intermediate, exercise: dumbbell, plan: p, history: [session("2026-11-08", sets(8, [18, 18, 18], 1))] });
    expect(extended).toMatchObject({ decision: "increase-load", weight: 10 });
  });

  it("rispetta il carico minimo disponibile", () => {
    const hard = (d: string) => session(d, sets(20, [6, 6, 5], 1));
    const result = planExercise({ settings: intermediate, exercise: { ...barbell, minLoad: 20 }, plan, history: [hard("c"), hard("b"), hard("a")] });
    expect(result).toMatchObject({ decision: "reduce-sets", weight: 20 });
  });

  it("per gli esercizi assistiti progredire significa ridurre l'assistenza", () => {
    const assisted: CoachExerciseProfile = { ...machine, loadMode: "assisted", increment: 5, minLoad: 0 };
    const result = planExercise({ settings: intermediate, exercise: assisted, plan, history: [session("x", sets(30, [10, 10, 10], 2))] });
    expect(result).toMatchObject({ decision: "increase-load", weight: 25 });
  });
});

describe("Guida allenamento · sedute negative, stallo e scarico", () => {
  it("una singola seduta negativa non provoca una regressione", () => {
    const result = planExercise({ settings: intermediate, exercise: barbell, plan, history: [session("2026-11-05", sets(42.5, [6, 6, 5], 1)), session("2026-11-01", sets(42.5, [9, 9, 8], 2))] });
    expect(result).toMatchObject({ decision: "hold-difficult", weight: 42.5 });
    expect(result.reason).toContain("Una sola seduta negativa");
  });

  it("difficoltà ripetute: prima riduce il carico, poi anche le serie", () => {
    const hard = (d: string) => session(d, sets(42.5, [6, 6, 5], 1));
    const two = planExercise({ settings: intermediate, exercise: barbell, plan, history: [hard("b"), hard("a")] });
    expect(two).toMatchObject({ decision: "reduce-load", weight: 40 });
    const three = planExercise({ settings: intermediate, exercise: barbell, plan, history: [hard("c"), hard("b"), hard("a")] });
    expect(three.decision).toBe("reduce-sets");
    expect(three.prescription.sets).toBe(2);
    expect(three.reason).toContain("non posso stabilirle");
  });

  it("riconosce lo stallo su un esercizio e interviene in modo graduale", () => {
    const flat = (d: string) => session(d, sets(60, [8, 8, 7], 2));
    const three = planExercise({ settings: intermediate, exercise: barbell, plan, history: [flat("c"), flat("b"), flat("a")] });
    expect(three).toMatchObject({ decision: "stall-hold", weight: 60, stall: true });
    expect(three.prescription.rest).toBe(plan.rest + 30);
    const four = planExercise({ settings: intermediate, exercise: barbell, plan, history: [flat("d"), flat("c"), flat("b"), flat("a")] });
    expect(four).toMatchObject({ decision: "stall-reset", weight: 55, stall: true });
    const progressing = planExercise({ settings: intermediate, exercise: barbell, plan, history: [session("c", sets(60, [9, 8, 8], 2)), flat("b"), flat("a")] });
    expect(progressing.stall).toBe(false);
  });

  it("in fase di scarico riduce serie e carico e sospende cedimento e dropset", () => {
    const result = planExercise({ settings: { ...intermediate, phase: "deload", allowFailure: true, allowDropsets: true }, exercise: machine, plan, history: [session("a", sets(50, [10, 10, 9], 2))] });
    expect(result.decision).toBe("deload");
    expect(result.prescription.sets).toBe(2);
    expect(result.prescription.rirMin).toBe(4);
    expect(result.weight).toBe(45);
    expect(result.failureSet).toBeUndefined();
    expect(result.dropsetSet).toBeUndefined();
  });

  it("ignora le sedute di scarico nel calcolo della progressione", () => {
    const result = planExercise({ settings: intermediate, exercise: barbell, plan, history: [session("b", sets(36, [8, 8], 4), { deload: true }), session("a", sets(40, [10, 10, 10], 2))] });
    expect(result).toMatchObject({ decision: "increase-load", weight: 42.5 });
  });

  it("distingue lo stallo di un esercizio dal peggioramento su più esercizi", () => {
    expect(globalTrend([["down", "flat", "flat", "up"]]).level).toBe("none");
    expect(globalTrend([["down", "down", "flat"]]).level).toBe("watch");
    const deload = globalTrend([["down", "down", "flat"], ["down", "down", "up", "down"]]);
    expect(deload.level).toBe("deload");
    expect(deload.message).toContain("non posso stabilirne la causa");
    expect(globalTrend([["down", "down"], ["down", "down"]]).level).toBe("none"); // troppo pochi esercizi
  });

  it("confronta le sedute senza contare le riduzioni pianificate come peggioramenti", () => {
    expect(compareSessions(session("a", sets(40, [10, 10])), session("b", sets(42.5, [8, 8])), "external")).toBe("up");
    expect(compareSessions(session("a", sets(40, [10, 10])), session("b", sets(40, [9, 9])), "external")).toBe("down");
    expect(compareSessions(session("a", sets(40, [10, 10])), session("b", sets(40, [10, 9])), "external")).toBe("flat");
    expect(compareSessions(session("a", sets(40, [10, 10])), session("b", sets(37.5, [9, 9]), { plannedReduction: true }), "external")).toBe("flat");
  });
});

describe("Guida allenamento · adattamento durante la seduta", () => {
  const base = planExercise({ settings: intermediate, exercise: barbell, plan, history: [session("a", sets(40, [9, 9, 8], 2))] });

  it("serie nel target: mantiene la previsione", () => {
    const advice = adviseSet(base, barbell, 1, [{ weight: 40, reps: 10, rir: 2 }]);
    expect(advice).toMatchObject({ change: "none", weight: 40, rule: "session-hold", scope: "session" });
  });

  it("non tratta il normale calo di ripetizioni come un problema", () => {
    const advice = adviseSet(base, barbell, 2, [{ weight: 40, reps: 10, rir: 2 }, { weight: 40, reps: 8, rir: 1 }]);
    expect(advice).toMatchObject({ change: "none", weight: 40 });
    expect(advice.reason).toContain("calo normale");
  });

  it("evita modifiche per differenze minime di RIR", () => {
    expect(adviseSet(base, barbell, 1, [{ weight: 40, reps: 10, rir: 3 }]).change).toBe("none");
    expect(adviseSet(base, barbell, 1, [{ weight: 40, reps: 9, rir: 1 }]).change).toBe("none");
  });

  it("serie molto più dura: più recupero, oppure piccolo calo di carico se sotto il range", () => {
    const harder = adviseSet(base, barbell, 1, [{ weight: 40, reps: 8, rir: 0 }]);
    expect(harder).toMatchObject({ change: "rest-up", weight: 40, rest: 150 });
    const below = adviseSet(base, barbell, 1, [{ weight: 40, reps: 6, rir: 0 }]);
    expect(below).toMatchObject({ change: "load-down", weight: 37.5 });
    const technique = adviseSet(base, barbell, 1, [{ weight: 40, reps: 9, rir: 2, flag: "technique" }]);
    expect(technique).toMatchObject({ change: "load-down", weight: 37.5 });
    expect(technique.notes.join(" ")).toContain("solo per oggi");
  });

  it("serie troppo facile: incremento compatibile con l'attrezzatura, altrimenti più ripetizioni", () => {
    const easy = adviseSet(base, barbell, 1, [{ weight: 40, reps: 10, rir: 5 }]);
    expect(easy).toMatchObject({ change: "load-up", weight: 42.5 });
    const light: CoachExerciseProfile = { ...machine, increment: 5, minLoad: 0 };
    const p = planExercise({ settings: intermediate, exercise: light, plan, history: [session("a", sets(20, [9, 9, 9], 2))] });
    const big = adviseSet(p, light, 1, [{ weight: 20, reps: 10, rir: 5 }]);
    expect(big).toMatchObject({ change: "none", weight: 20, rule: "session-hold-top" });
  });

  it("non alterna su e giù il carico nella stessa seduta", () => {
    const advice = adviseSet(base, barbell, 2, [{ weight: 40, reps: 10, rir: 5 }, { weight: 42.5, reps: 7, rir: 1 }]);
    expect(advice.weight).toBe(42.5);
    expect(advice.change).not.toBe("load-down");
  });

  it("rispetta il carico modificato manualmente dall'utente", () => {
    const advice = adviseSet(base, barbell, 1, [{ weight: 45, reps: 9, rir: 2 }]);
    expect(advice.weight).toBe(45);
  });
});

describe("Guida allenamento · cedimento e dropset", () => {
  const history = [session("a", sets(50, [11, 10, 10], 2))];
  const enabled = { experience: "intermediate" as const, phase: "intensification" as const, allowFailure: true };

  it("il cedimento non è mai il comportamento predefinito", () => {
    expect(planExercise({ exercise: machine, plan, history }).failureSet).toBeUndefined();
    expect(planExercise({ settings: { ...enabled, experience: "beginner" }, exercise: machine, plan, history }).failureSet).toBeUndefined();
    expect(planExercise({ settings: { ...enabled, phase: "standard" }, exercise: machine, plan, history }).failureSet).toBeUndefined();
    expect(planExercise({ settings: enabled, exercise: barbell, plan, history }).failureSet).toBeUndefined();
  });

  it("se abilitato, RIR 0 solo nell'ultima serie di un esercizio adatto, senza tentativi falliti", () => {
    const p = planExercise({ settings: enabled, exercise: machine, plan, history });
    expect(p.failureSet).toBe(3);
    expect(adviseSet(p, machine, 1, [{ weight: 50, reps: 11, rir: 2 }]).technique).toBeUndefined();
    const last = adviseSet(p, machine, 2, [{ weight: 50, reps: 11, rir: 2 }, { weight: 50, reps: 10, rir: 2 }]);
    expect(last).toMatchObject({ rirMin: 0, rirMax: 0, technique: { kind: "failure" } });
    expect(last.technique!.text).toContain("Non serve un tentativo fallito");
    expect(rirText(0, 0)).toContain("Non tentare una ripetizione");
    const struggle = adviseSet(p, machine, 2, [{ weight: 50, reps: 11, rir: 2, flag: "technique" }, { weight: 47.5, reps: 10, rir: 2 }]);
    expect(struggle.technique).toBeUndefined();
  });

  it("una serie al cedimento prevista non blocca la progressione", () => {
    const result = planExercise({ settings: enabled, exercise: machine, plan, history: [session("a", [{ weight: 50, reps: 10, rir: 2 }, { weight: 50, reps: 10, rir: 2 }, { weight: 50, reps: 10, rir: 0, plannedRir: 0 }])] });
    expect(result.decision).toBe("increase-load");
  });

  it("le dropset sono disattivate di default e non compensano serie facili o negative", () => {
    const p = planExercise({ settings: intermediate, exercise: machine, plan, history });
    expect(p.dropsetSet).toBeUndefined();
    const easy = adviseSet(p, machine, 2, [{ weight: 50, reps: 12, rir: 5 }, { weight: 52.5, reps: 10, rir: 4 }]);
    expect(easy.technique).toBeUndefined();
    const negative = planExercise({ settings: { ...intermediate, allowDropsets: true }, exercise: machine, plan, history: [session("a", sets(50, [6, 6, 5], 0))] });
    expect(negative.dropsetSet).toBeUndefined();
  });

  it("se abilitate: solo esercizi compatibili, ultima serie, frequenza limitata e istruzioni precise", () => {
    const settings = { ...intermediate, allowDropsets: true };
    const p = planExercise({ settings, exercise: machine, plan, history });
    expect(p.dropsetSet).toBe(3);
    const advice = adviseSet(p, machine, 2, [{ weight: 50, reps: 11, rir: 2 }, { weight: 50, reps: 10, rir: 2 }]);
    expect(advice.technique).toMatchObject({ kind: "dropset", dropWeight: 40 });
    expect(advice.technique!.text).toMatch(/senza recupero.*RIR|ripetizione.*Una sola discesa.*lavoro aggiuntivo/s);
    expect(planExercise({ settings, exercise: barbell, plan, history }).dropsetSet).toBeUndefined();
    expect(planExercise({ settings: { ...settings, experience: "beginner" }, exercise: machine, plan, history }).dropsetSet).toBeUndefined();
    const recent = [session("b", [...sets(50, [11, 10]), { weight: 50, reps: 10, drop: true }]), ...history];
    expect(planExercise({ settings, exercise: machine, plan, history: recent }).dropsetSet).toBeUndefined();
    expect(planExercise({ settings, exercise: machine, plan, history, dropsetsPlanned: COACH_CONFIG.dropset.maxPerWorkout }).dropsetSet).toBeUndefined();
  });
});

describe("Guida allenamento · determinismo e testi", () => {
  it("stessi dati e impostazioni producono gli stessi suggerimenti", () => {
    const input = { settings: intermediate, exercise: barbell, plan, history: [session("a", sets(40, [10, 9, 9], [2, 2, 1]))] };
    const a = planExercise(structuredClone(input)), b = planExercise(structuredClone(input));
    expect(a).toEqual(b);
    expect(adviseSet(a, barbell, 1, [{ weight: 40, reps: 10, rir: 2 }])).toEqual(adviseSet(b, barbell, 1, [{ weight: 40, reps: 10, rir: 2 }]));
  });

  it("formatta recupero e RIR in parole semplici", () => {
    expect(restText(120)).toBe("2 minuti");
    expect(restText(90)).toBe("1 min 30 s");
    expect(restText(45)).toBe("45 secondi");
    expect(rirText(1, 1)).toBe("Fermati quando pensi di poter fare ancora 1 ripetizione.");
    expect(rirText(1, 2)).toBe("Fermati quando pensi di poter fare ancora 1–2 ripetizioni.");
  });
});

describe("Guida allenamento · adattatore dell'archivio", () => {
  function archive(): DataSet {
    const d = seed();
    d.plans = [{ id: "plan", userId: "local", name: "Piano", description: "", createdAt: "2026-10-01T10:00:00Z", updatedAt: "2026-10-01T10:00:00Z", active: true, archived: false }];
    d.days = [{ id: "day", planId: "plan", name: "Giorno 1", order: 0 }];
    d.planExercises = [{ id: "entry", dayId: "day", exerciseId: "exercise-0", sets: 3, repsMin: 8, repsMax: 10, rirMin: 2, rirMax: 2, rest: 120, notes: "", order: 0 }];
    const workout = (id: string, date: string, status: "completed" | "draft") => ({ id, userId: "local", planId: "plan", dayId: "day", planName: "Piano", dayName: "Giorno 1", date, startedAt: date + "T10:00:00Z", duration: 3600, notes: "", status });
    d.workouts = [workout("w1", "2026-11-01", "completed"), workout("w2", "2026-11-08", "draft")];
    const row = (id: string, workoutId: string) => ({ id, workoutId, exerciseId: "exercise-0", name: "Panca piana", loadMode: "external" as const, order: 0, rest: 120, notes: "", repsMin: 8, repsMax: 10, rirMin: 2, rirMax: 2 });
    d.workoutExercises = [row("e1", "w1"), row("e2", "w2")];
    const set = (id: string, ex: string, n: number, extra: Partial<WorkoutLogSet>): WorkoutLogSet => ({ id, workoutExerciseId: ex, number: n, kind: "work", weight: 40, reps: 10, completed: true, ...extra });
    d.sets = [
      set("w1-r", "e1", 1, { kind: "warmup", weight: 20, reps: 12, rpe: 3 }),
      set("w1-1", "e1", 2, { rpe: 8 }), set("w1-2", "e1", 3, { rpe: 8 }), set("w1-3", "e1", 4, { rpe: 8 }),
      set("w2-1", "e2", 1, { completed: false }), set("w2-2", "e2", 2, { completed: false }), set("w2-3", "e2", 3, { completed: false }),
    ];
    return d;
  }

  it("ricava la progressione dallo storico escludendo il riscaldamento", () => {
    const d = archive();
    const guide = workoutGuides(d, "w2").get("e2")!;
    expect(guide.history).toHaveLength(1);
    expect(guide.history[0].sets).toHaveLength(3);
    expect(guide.plan).toMatchObject({ decision: "increase-load", weight: 42.5 });
    const advice = adviceForSet(d, guide, d.sets.find((s) => s.id === "w2-1")!)!;
    expect(advice.headline).toBe("Serie 1: 8–10 ripetizioni con 42,5 kg.");
    expect(advice.reason).toContain("Oggi prova 42,5 kg");
  });

  it("riconosce isolamento e attrezzature adatte dal catalogo, con preferenze modificabili", () => {
    const d = seed();
    const curl = d.exercises.find((e) => e.name === "Leg extension")!;
    expect(exerciseProfile(d, curl.id, "external")).toMatchObject({ movement: "isolation", safeForFailure: true });
    const squat = d.exercises.find((e) => e.name === "Squat")!;
    expect(exerciseProfile(d, squat.id, "external")).toMatchObject({ movement: "compound", safeForFailure: false });
    d.exercisePreferences.push({ id: squat.id, favorite: false, weightStep: 1.25, coach: { movement: "isolation", minLoad: 20 } });
    expect(exerciseProfile(d, squat.id, "external")).toMatchObject({ movement: "isolation", increment: 1.25, minLoad: 20 });
  });

  it("salva una prescrizione ricostruibile e valida, separata dai risultati registrati", () => {
    const d = archive();
    const guide = workoutGuides(d, "w2").get("e2")!;
    const snapshot = snapshotOf(adviceForSet(d, guide, d.sets.find((s) => s.id === "w2-1")!)!);
    expect(validCoachSnapshot(snapshot)).toBe(true);
    const done = d.sets.find((s) => s.id === "w2-1")!;
    Object.assign(done, { completed: true, weight: 40, reps: 9, rpe: 8, coach: snapshot, flag: "hard" });
    expect(() => validateIntegrity(d)).not.toThrow();
    expect(done.coach!.weight).toBe(42.5);
    expect(done.weight).toBe(40);
    d.sets[0].flag = "x" as never;
    expect(() => validateIntegrity(d)).toThrow();
  });

  it("calcola la tendenza generale senza errori su un archivio piccolo", () => {
    expect(trainingTrend(archive()).level).toBe("none");
  });
});

describe("Guida allenamento · backup", () => {
  it("conserva impostazioni, segnalazioni e prescrizioni nel backup", async () => {
    const { exportBackup, importBackup } = await import("../src/app/services/backup");
    const d = seed();
    d.settings[0].coach = { goal: "endurance", experience: "advanced", allowDropsets: true };
    d.exercisePreferences.push({ id: "exercise-0", favorite: false, coach: { movement: "isolation", minLoad: 10, dropsetCompatible: false } });
    d.workouts = [{ id: "w", userId: "local", planId: "p", dayId: "d", planName: "Piano", dayName: "Giorno", date: "2026-11-01", startedAt: "2026-11-01T10:00:00.000Z", endedAt: "2026-11-01T11:00:00.000Z", duration: 3600, notes: "", status: "completed" }];
    d.workoutExercises = [{ id: "we", workoutId: "w", exerciseId: "exercise-0", name: "Panca piana", loadMode: "external", order: 0, rest: 120, notes: "" }];
    d.sets = [{ id: "s", workoutExerciseId: "we", number: 1, kind: "work", weight: 40, reps: 9, rpe: 8, completed: true, flag: "technique", coach: { v: 1, rule: "session-hold", scope: "session", weight: 40, repsMin: 8, repsMax: 10, repsTarget: 9, rirMin: 2, rirMax: 2, rest: 150, reason: "Serie nel target." } }];
    const restored = await importBackup(await exportBackup(d));
    expect(restored.settings[0].coach).toEqual(d.settings[0].coach);
    expect(restored.exercisePreferences.find((p) => p.id === "exercise-0")!.coach).toEqual({ movement: "isolation", minLoad: 10, dropsetCompatible: false });
    expect(restored.sets[0]).toMatchObject({ flag: "technique", coach: d.sets[0].coach, weight: 40, reps: 9 });
  });
});
