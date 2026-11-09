/**
 * Coach Ombra: suggerimento serie per serie, calcolato solo con dati già presenti
 * (ultima seduta confrontabile, serie completate oggi, RPE, check-in di benessere).
 * Funzioni pure: non leggono né scrivono l'archivio. Tutti i carichi sono in kg.
 */
export type CoachAction = "raise" | "hold" | "lower";
export type Readiness = "low" | "normal";

export interface CoachSetResult {
  weight: number;
  reps: number;
  rpe?: number;
}

export interface CoachInput {
  repsMin: number;
  repsMax: number;
  incrementKg: number;
  /** Carico già impostato nella prossima serie, usato solo se manca ogni riferimento. */
  plannedWeight?: number;
  /** Serie di lavoro dell'ultima seduta confrontabile. */
  reference?: CoachSetResult[];
  /** Serie di lavoro già completate nella seduta in corso, in ordine. */
  done: CoachSetResult[];
  readiness?: Readiness;
}

export interface CoachSuggestion {
  action: CoachAction;
  weight: number;
  reps: number;
  reason: string;
  basis: "session" | "reference" | "none";
}

const round = (value: number) => Math.round(value * 1000000) / 1000000;
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
const validRpe = (rpe: number | undefined): rpe is number =>
  rpe !== undefined && Number.isFinite(rpe) && rpe >= 1 && rpe <= 10;
const validSet = (set: CoachSetResult) =>
  Number.isFinite(set.weight) &&
  set.weight >= 0 &&
  Number.isInteger(set.reps) &&
  set.reps >= 1;

/**
 * Propone carico e ripetizioni della prossima serie di lavoro.
 * Restituisce null se mancano dati affidabili: in quel caso l'app non suggerisce nulla.
 */
export function coachNextSet(input: CoachInput): CoachSuggestion | null {
  const { repsMin, repsMax, incrementKg, readiness } = input;
  if (
    !Number.isInteger(repsMin) ||
    !Number.isInteger(repsMax) ||
    repsMin < 1 ||
    repsMax < repsMin ||
    !Number.isFinite(incrementKg) ||
    incrementKg <= 0
  )
    return null;

  const done = input.done.filter(validSet);
  const last = done[done.length - 1];
  if (last) {
    const rpe = validRpe(last.rpe) ? last.rpe : undefined;
    const lower = (reason: string): CoachSuggestion => ({
      action: "lower",
      weight: round(Math.max(0, last.weight - incrementKg)),
      reps: repsMin,
      reason,
      basis: "session",
    });
    if (last.reps < repsMin)
      return lower(
        `Hai fatto ${last.reps} ripetizioni, sotto il minimo di ${repsMin}: scendi un po' per tenere la tecnica pulita.`,
      );
    if (readiness === "low" && rpe !== undefined && rpe >= 9)
      return lower(
        "Serie molto dura e recupero basso nel check-in di oggi: alleggerisci per le prossime serie.",
      );
    if (rpe !== undefined && rpe >= 9.5)
      return {
        action: "hold",
        weight: last.weight,
        reps: clamp(last.reps, repsMin, repsMax),
        reason:
          "Serie al limite: mantieni il carico e cerca di ripetere lo stesso risultato.",
        basis: "session",
      };
    if (
      rpe !== undefined &&
      rpe <= 7 &&
      last.reps >= repsMax &&
      readiness !== "low"
    )
      return {
        action: "raise",
        weight: round(last.weight + incrementKg),
        reps: repsMin,
        reason: `Serie facile al massimo delle ripetizioni: prova +${round(incrementKg)} kg e riparti da ${repsMin}.`,
        basis: "session",
      };
    const step = rpe !== undefined && rpe <= 8 ? 1 : 0;
    return {
      action: "hold",
      weight: last.weight,
      reps: clamp(last.reps + step, repsMin, repsMax),
      reason:
        rpe === undefined
          ? "Mantieni il carico. Registra l'RPE per avere suggerimenti più precisi."
          : step
            ? "Mantieni il carico e prova una ripetizione in più."
            : "Mantieni carico e ripetizioni: lo sforzo è già alto.",
      basis: "session",
    };
  }

  const reference = (input.reference ?? []).filter(validSet);
  if (!reference.length) {
    const planned = input.plannedWeight;
    if (planned === undefined || !Number.isFinite(planned) || planned < 0)
      return null;
    return {
      action: "hold",
      weight: planned,
      reps: repsMin,
      reason:
        "Nessuna seduta di riferimento: parti dal carico impostato e registra l'RPE.",
      basis: "none",
    };
  }

  const weight = reference[0].weight;
  const allAtMax = reference.every((s) => s.reps >= repsMax);
  const easyEnough = reference.every((s) => validRpe(s.rpe) && s.rpe <= 8);
  if (readiness === "low")
    return {
      action: "hold",
      weight,
      reps: repsMin,
      reason:
        "Il check-in di oggi indica poco recupero: tieni lo stesso carico dell'ultima volta, senza aumentare.",
      basis: "reference",
    };
  if (allAtMax && easyEnough)
    return {
      action: "raise",
      weight: round(weight + incrementKg),
      reps: repsMin,
      reason: `Ultima volta tutte le serie a ${repsMax} ripetizioni con RPE fino a 8: prova +${round(incrementKg)} kg.`,
      basis: "reference",
    };
  const minReps = Math.min(...reference.map((s) => s.reps));
  return {
    action: "hold",
    weight,
    reps: clamp(minReps + 1, repsMin, repsMax),
    reason:
      "Stesso carico dell'ultima volta, puntando a una ripetizione in più.",
    basis: "reference",
  };
}

/** Deduce la prontezza dal check-in (scala 1-5; lo stress alto conta come negativo). */
export function readinessFromWellness(
  log?: { sleepQuality?: number; energy?: number; stress?: number } | null,
): Readiness | undefined {
  if (!log) return undefined;
  const scores: number[] = [];
  for (const value of [log.sleepQuality, log.energy])
    if (typeof value === "number" && value >= 1 && value <= 5)
      scores.push(value);
  if (typeof log.stress === "number" && log.stress >= 1 && log.stress <= 5)
    scores.push(6 - log.stress);
  if (!scores.length) return undefined;
  const mean = scores.reduce((sum, value) => sum + value, 0) / scores.length;
  return mean <= 2.4 ? "low" : "normal";
}
