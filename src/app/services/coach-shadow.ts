/**
 * Coach Ombra: suggerimento serie per serie, calcolato solo con dati già presenti
 * (sedute confrontabili, serie completate oggi, RPE, obiettivo del piano, check-in).
 * Funzioni pure: non leggono né scrivono l'archivio. Tutti i carichi sono in kg.
 *
 * Regole, in ordine:
 *  - durante la seduta conta l'ultima serie fatta (ripetizioni, RPE, check-in);
 *  - alla prima serie conta l'ultima seduta confrontabile, letta serie per serie;
 *  - rientro dopo una pausa lunga, stallo su più sedute e salto di carico troppo
 *    grande hanno la precedenza sull'aumento automatico;
 *  - senza RPE il Coach non propone aumenti, salvo ripetizioni chiaramente oltre il massimo.
 */
import type { DataSet, WorkoutLogExercise } from "../models/domain";
import { setupKey } from "./training-flow";

export type CoachAction = "raise" | "hold" | "lower" | "stop";
export type Readiness = "low" | "normal" | "high";
export type CoachLoadMode =
  "external" | "bodyweight" | "weighted-bodyweight" | "assisted";
export type CoachConfidence = "low" | "medium" | "high";
export type CoachFlag =
  "stall" | "layoff" | "big-jump" | "fatigue" | "sore" | "low-readiness" | "first-time";

export interface CoachSetResult {
  weight: number;
  reps: number;
  rpe?: number;
  /** Riscontro strutturato dichiarato dall'utente (mai dedotto dal testo libero). */
  rir?: number | null;
  technique?: "good" | "degraded" | "unknown";
  pain?: boolean;
}

export interface CoachSession {
  /** Riga dell'allenamento da cui arrivano le serie: serve a riconoscere la seduta. */
  id?: string;
  date?: string;
  sets: CoachSetResult[];
}

export interface CoachInput {
  repsMin: number;
  repsMax: number;
  incrementKg: number;
  /** Modalità di carico: senza indicazione vale il carico esterno (bilanciere, manubri, macchine). */
  loadMode?: CoachLoadMode;
  /** Sforzo previsto dal piano (RPE 6–10). Senza indicazione vale 8. */
  targetRpe?: number;
  /** Carico già impostato nella prossima serie, usato solo se manca ogni riferimento. */
  plannedWeight?: number;
  /** Posizione della serie tra le allenanti (0 = prima). Senza indicazione segue le serie fatte. */
  setIndex?: number;
  /** Serie di lavoro dell'ultima seduta confrontabile. */
  reference?: CoachSetResult[];
  /** Sedute confrontabili precedenti al riferimento, dalla più recente. */
  history?: CoachSession[];
  /** Giorni trascorsi dall'ultima seduta confrontabile. */
  daysSinceReference?: number;
  /** Serie di lavoro già completate nella seduta in corso, in ordine. */
  done: CoachSetResult[];
  readiness?: Readiness;
  /** Il muscolo principale è segnato come indolenzito nel check-in di oggi. */
  sore?: boolean;
  /** "next": il riferimento è la seduta appena conclusa e il consiglio vale per la prossima. */
  perspective?: "now" | "next";
  /** Formato del carico per i testi (unità dell'utente). Predefinito: kg. */
  formatWeight?: (kg: number) => string;
}

export interface CoachSuggestion {
  action: CoachAction;
  weight: number;
  reps: number;
  reason: string;
  basis: "session" | "reference" | "none";
  /** Etichetta breve dell'azione, per esempio «Sali di carico». */
  title: string;
  confidence: CoachConfidence;
  /** Dati usati per il suggerimento, pronti da mostrare. */
  evidence: string[];
  flags: CoachFlag[];
  /** Secondi di recupero in più consigliati dopo una serie molto dura (0 = nessuno). */
  restBonus: number;
  /** Massimale stimato in kg, solo per il carico esterno. */
  estimated1rm?: number;
}

const EPSILON = 0.000001;
const round = (value: number) => Math.round(value * 1000000) / 1000000;
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
const validRpe = (rpe: number | undefined): rpe is number =>
  rpe !== undefined && Number.isFinite(rpe) && rpe >= 1 && rpe <= 10;
/** L'RPE indicato vale di più; altrimenti le ripetizioni in riserva dichiarate (RPE ≈ 10 − RIR). */
const effort = (set: CoachSetResult): number | undefined =>
  validRpe(set.rpe)
    ? set.rpe
    : typeof set.rir === "number" && Number.isFinite(set.rir) && set.rir >= 0 && set.rir <= 10
      ? 10 - set.rir
      : undefined;
const validSet = (set: CoachSetResult) =>
  !!set &&
  Number.isFinite(set.weight) &&
  set.weight >= 0 &&
  Number.isInteger(set.reps) &&
  set.reps >= 1;
const same = (a: number, b: number) => Math.abs(a - b) < EPSILON;
const number = (value: number) =>
  value.toLocaleString("it-IT", { maximumFractionDigits: 1 });
const defaultFormat = (kg: number) => number(kg) + " kg";

/**
 * Massimale stimato (formula di Epley) contando anche le ripetizioni lasciate in riserva.
 * Oltre 20 ripetizioni complessive la stima non è affidabile e non viene restituita.
 */
export function estimate1rm(set: CoachSetResult): number | undefined {
  if (!validSet(set) || set.weight <= 0) return undefined;
  const level = effort(set);
  const reserve = level !== undefined ? clamp(10 - level, 0, 5) : 1;
  const total = set.reps + reserve;
  if (total > 20) return undefined;
  return total <= 1 ? set.weight : set.weight * (1 + total / 30);
}

/** Ripetizioni attese a un certo carico e sforzo, dato un massimale stimato. */
function repsAt(max: number, weight: number, rpe: number) {
  if (!(weight > 0) || !(max > 0)) return undefined;
  return Math.floor(30 * (max / weight - 1) - (10 - rpe) + 1e-9);
}

function daysLabel(days: number) {
  return days <= 0 ? "oggi" : days === 1 ? "ieri" : days + " giorni fa";
}

function setsLine(sets: CoachSetResult[], format: (kg: number) => string, loaded: boolean) {
  if (!loaded) return sets.map((set) => set.reps).join(" · ") + " rip.";
  if (sets.every((set) => same(set.weight, sets[0].weight)))
    return format(sets[0].weight) + " × " + sets.map((set) => set.reps).join(" · ");
  return sets.map((set) => format(set.weight) + " × " + set.reps).join(" · ");
}

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

  const mode = input.loadMode ?? "external";
  const loaded = mode !== "bodyweight";
  const assisted = mode === "assisted";
  const format = input.formatWeight ?? defaultFormat;
  const target = validRpe(input.targetRpe) ? clamp(input.targetRpe, 6, 10) : 8;
  const next = input.perspective === "next";
  const tired = readiness === "low" || input.sore === true;
  const inRange = (reps: number) => clamp(reps, repsMin, repsMax);
  /** Sposta il carico di un certo numero di incrementi: positivo = più difficile. */
  const shift = (weight: number, steps: number) =>
    round(Math.max(0, weight + (assisted ? -steps : steps) * incrementKg));
  const stepsFor = (weight: number, fraction: number) =>
    Math.max(1, Math.round((weight * fraction) / incrementKg));
  const change = (from: number, to: number) => {
    const delta = round(to - from);
    return (delta > 0 ? "+" : "−") + format(Math.abs(delta));
  };

  const done = input.done.filter(validSet);
  const reference = (input.reference ?? []).filter(validSet);
  const last = done[done.length - 1];
  const index = Math.max(
    0,
    Number.isInteger(input.setIndex) ? (input.setIndex as number) : done.length,
  );

  const evidence: string[] = [];
  const flags: CoachFlag[] = [];
  if (reference.length) {
    const rpes = reference.map(effort).filter((value): value is number => value !== undefined);
    evidence.push(
      (next ? "Seduta di oggi" : "Volta scorsa") +
        (!next && input.daysSinceReference !== undefined && input.daysSinceReference >= 0
          ? " (" + daysLabel(input.daysSinceReference) + ")"
          : "") +
        ": " +
        setsLine(reference, format, loaded) +
        (rpes.length ? " · RPE fino a " + number(Math.max(...rpes)) : " · RPE non registrato"),
    );
  }
  if (done.length)
    evidence.push(
      "Oggi finora: " +
        setsLine(done, format, loaded) +
        (effort(last) !== undefined ? " · ultima serie RPE " + number(effort(last)!) : ""),
    );
  evidence.push(
    "Obiettivo: " +
      (repsMin === repsMax ? repsMin : repsMin + "–" + repsMax) +
      " rip. · RPE " +
      number(target),
  );
  const maxes = (mode === "external" ? [...done, ...(done.length ? [] : reference)] : [])
    .map(estimate1rm)
    .filter((value): value is number => value !== undefined);
  const estimated1rm = maxes.length ? round(Math.max(...maxes)) : undefined;
  if (estimated1rm !== undefined) evidence.push("Massimale stimato ≈ " + format(estimated1rm));
  if (readiness === "low") {
    evidence.push("Check-in di oggi: recupero basso");
    flags.push("low-readiness");
  } else if (readiness === "high") evidence.push("Check-in di oggi: ottimo recupero");
  if (input.sore) {
    evidence.push("Check-in di oggi: muscolo indolenzito");
    flags.push("sore");
  }

  const titles: Record<CoachAction, string> = {
    raise: !loaded ? "Una ripetizione in più" : assisted ? "Riduci l'assistenza" : "Sali di carico",
    hold: loaded ? "Mantieni il carico" : "Mantieni",
    lower: assisted ? "Aumenta l'assistenza" : "Alleggerisci",
    stop: "Fermati",
  };
  const build = (
    action: CoachAction,
    weight: number,
    reps: number,
    reason: string,
    basis: CoachSuggestion["basis"],
    confidence: CoachConfidence,
    extra: { title?: string; restBonus?: number } = {},
  ): CoachSuggestion => ({
    action,
    weight: loaded ? round(Math.max(0, weight)) : 0,
    reps,
    reason,
    basis,
    title: extra.title ?? titles[action],
    confidence,
    evidence,
    flags,
    restBonus: extra.restBonus ?? 0,
    ...(estimated1rm === undefined ? {} : { estimated1rm }),
  });

  /* ===== Durante la seduta: decide l'ultima serie fatta ===== */
  if (last) {
    const stop = (reason: string) => {
      flags.push("fatigue");
      return build("stop", last.weight, repsMin, reason, "session", "high");
    };
    if (done.some((set) => set.pain))
      return stop(
        "Hai segnalato dolore: interrompi questo esercizio oggi. Non compensare con altre serie; se il dolore persiste, fatti valutare.",
      );
    if (last.technique === "degraded")
      return stop(
        "La tecnica è peggiorata: chiudi qui l'esercizio. La prossima volta riparti da questo carico curando l'esecuzione.",
      );
    const rpe = effort(last);
    const confidence: CoachConfidence = rpe === undefined ? "medium" : "high";
    const session = (
      action: CoachAction,
      weight: number,
      reps: number,
      reason: string,
      extra: { title?: string; restBonus?: number } = {},
    ) => build(action, weight, reps, reason, "session", confidence, extra);
    const gap = repsMin - last.reps;

    if (gap > 0) {
      flags.push("fatigue");
      if (!loaded)
        return session(
          "hold",
          0,
          repsMin,
          `Hai chiuso a ${last.reps} ripetizioni, sotto il minimo di ${repsMin}: recupera bene e punta al minimo nella prossima serie.`,
          { restBonus: 30 },
        );
      const weight = shift(last.weight, gap >= 3 ? -2 : -1);
      return session(
        "lower",
        weight,
        repsMin,
        `Hai chiuso a ${last.reps} ripetizioni, sotto il minimo di ${repsMin}: ${assisted ? "aumenta l'assistenza" : "scendi"} a ${format(weight)} per tenere la tecnica pulita.`,
        { restBonus: 30 },
      );
    }
    if (tired && rpe !== undefined && rpe >= 9) {
      flags.push("fatigue");
      const why = input.sore && readiness !== "low" ? "muscolo indolenzito" : "recupero basso";
      if (!loaded)
        return session(
          "hold",
          0,
          inRange(last.reps - 1),
          `Serie molto dura e ${why} nel check-in di oggi: togli una ripetizione alle prossime serie.`,
          { restBonus: 30 },
        );
      return session(
        "lower",
        shift(last.weight, -1),
        repsMin,
        `Serie molto dura e ${why} nel check-in di oggi: alleggerisci per le prossime serie.`,
        { restBonus: 30 },
      );
    }
    if (rpe !== undefined && rpe >= 9.5) {
      flags.push("fatigue");
      if (loaded && last.reps - 1 < repsMin) {
        const weight = shift(last.weight, -1);
        return session(
          "lower",
          weight,
          repsMin,
          `Serie al limite già sul minimo di ripetizioni: ${assisted ? "aumenta l'assistenza" : "scendi"} a ${format(weight)} per restare nell'intervallo.`,
          { restBonus: 60 },
        );
      }
      return session(
        "hold",
        last.weight,
        inRange(last.reps - 1),
        loaded
          ? "Serie al limite: mantieni il carico, anche una ripetizione in meno va bene. Recupera un po' di più."
          : "Serie al limite: anche una ripetizione in meno va bene. Recupera un po' di più.",
        { restBonus: 60 },
      );
    }
    const atTop = last.reps >= repsMax;
    if (rpe !== undefined && atTop && rpe <= target - 1 && !tired) {
      if (!loaded)
        return session(
          "raise",
          0,
          last.reps + 1,
          `Serie facile al massimo delle ripetizioni: prova ${last.reps + 1}. Quando superi di molto l'intervallo, passa a una variante più difficile o aggiungi zavorra.`,
        );
      const fresh = mode === "external" ? estimate1rm(last) : undefined;
      let steps = rpe <= target - 2 ? 2 : 1;
      // Dopo una serie già fatta le ripetizioni disponibili calano di circa una.
      const reachable = (count: number) => {
        const top = fresh === undefined ? undefined : repsAt(fresh, shift(last.weight, count), 10);
        return top === undefined ? undefined : top - 1;
      };
      if (steps === 2 && (reachable(2) ?? repsMin) < repsMin) steps = 1;
      const weight = shift(last.weight, steps);
      if ((reachable(steps) ?? repsMin) < repsMin) {
        flags.push("big-jump");
        return session(
          "hold",
          last.weight,
          last.reps + 1,
          `Il prossimo scatto (${change(last.weight, weight)}) è ancora troppo grande per restare sopra ${repsMin} ripetizioni: resta a ${format(last.weight)} e prova ${last.reps + 1}, oppure usa un incremento più piccolo.`,
          { title: "Consolida prima del salto" },
        );
      }
      const expected = fresh === undefined ? undefined : repsAt(fresh, weight, target);
      const reps = expected === undefined ? repsMin : inRange(expected - 1);
      return session(
        "raise",
        weight,
        reps,
        `Serie facile al massimo delle ripetizioni: prova ${format(weight)} (${change(last.weight, weight)}) e punta a ${reps}.`,
      );
    }
    if (rpe === undefined && loaded && last.reps >= repsMax + 2 && !tired) {
      const weight = shift(last.weight, 1);
      return session(
        "raise",
        weight,
        repsMin,
        `Hai superato di ${last.reps - repsMax} il massimo delle ripetizioni: prova ${format(weight)}. Registra l'RPE per suggerimenti più precisi.`,
      );
    }
    if (rpe === undefined)
      return session(
        "hold",
        last.weight,
        inRange(last.reps),
        loaded
          ? "Mantieni il carico. Indica l'RPE o le ripetizioni ancora possibili per suggerimenti più precisi."
          : "Ripeti le stesse ripetizioni. Indica l'RPE o le ripetizioni ancora possibili per suggerimenti più precisi.",
      );
    if (rpe <= target && !tired) {
      if (atTop)
        return session(
          "hold",
          last.weight,
          loaded ? repsMax : inRange(last.reps),
          loaded
            ? `Sei già al massimo delle ripetizioni: ripeti ${repsMax}. Se resta facile (RPE ${number(target - 1)} o meno) il Coach propone di salire.`
            : "Sei già al massimo delle ripetizioni: ripeti lo stesso risultato.",
        );
      return session(
        "hold",
        last.weight,
        inRange(last.reps + 1),
        loaded
          ? "Mantieni il carico e prova una ripetizione in più."
          : "Prova una ripetizione in più.",
      );
    }
    return session(
      "hold",
      last.weight,
      inRange(last.reps),
      tired && rpe <= target
        ? "Con il check-in di oggi non serve forzare: ripeti lo stesso risultato."
        : loaded
          ? "Mantieni carico e ripetizioni: lo sforzo è già alto."
          : "Mantieni le ripetizioni: lo sforzo è già alto.",
      { restBonus: rpe >= 9 ? 30 : 0 },
    );
  }

  /* ===== Prima serie senza storico ===== */
  if (!reference.length) {
    const planned = input.plannedWeight;
    if (planned === undefined || !Number.isFinite(planned) || planned < 0)
      return null;
    flags.push("first-time");
    return build(
      "hold",
      planned,
      repsMin,
      "Nessuna seduta di riferimento: parti dal carico impostato e registra l'RPE.",
      "none",
      "low",
    );
  }

  /* ===== Prima serie: decide l'ultima seduta confrontabile ===== */
  const anchor = reference[Math.min(index, reference.length - 1)];
  const weight = anchor.weight;
  const days = input.daysSinceReference;
  const rpes = reference.map(effort).filter((value): value is number => value !== undefined);
  const allRpe = rpes.length === reference.length;
  const maxRpe = rpes.length ? Math.max(...rpes) : undefined;
  const under = reference.filter((set) => set.reps < repsMin).length;
  const allAtMax = reference.every((set) => set.reps >= repsMax);
  const lastTime = next ? "oggi" : "l'ultima volta";
  const LastTime = next ? "Oggi" : "L'ultima volta";
  const confidence: CoachConfidence =
    allRpe && (days === undefined || days <= 14) ? "high" : "medium";
  const fromReference = (
    action: CoachAction,
    value: number,
    reps: number,
    reason: string,
    extra: { title?: string; restBonus?: number; confidence?: CoachConfidence } = {},
  ) => build(action, value, reps, reason, "reference", extra.confidence ?? confidence, extra);

  if (reference.some((set) => set.pain || set.technique === "degraded"))
    return fromReference(
      "hold",
      weight,
      repsMin,
      reference.some((set) => set.pain)
        ? next
          ? "Oggi hai segnalato dolore: la prossima volta non aumentare. Se ricompare, interrompi l'esercizio."
          : "L'ultima volta hai segnalato dolore: non aumentare. Se ricompare, interrompi l'esercizio."
        : next
          ? "Oggi la tecnica è peggiorata: la prossima volta stesso carico, curando l'esecuzione prima di aumentare."
          : "L'ultima volta la tecnica è peggiorata: stesso carico, curando l'esecuzione prima di aumentare.",
      { title: "Non aumentare", confidence: "high" },
    );
  if (!next && days !== undefined && days >= 42 && loaded) {
    flags.push("layoff");
    const lighter = shift(weight, -stepsFor(weight, 0.1));
    return fromReference(
      "lower",
      lighter,
      repsMin,
      `Sono passati ${days} giorni dall'ultima volta: riparti da ${format(lighter)} (circa ${assisted ? "+" : "−"}10%) e risali nelle prossime sedute.`,
      { title: "Rientro graduale", confidence: "low" },
    );
  }
  if (!next && days !== undefined && days >= 21) {
    flags.push("layoff");
    return fromReference(
      "hold",
      weight,
      inRange(anchor.reps - 1),
      `Sono passati ${days} giorni dall'ultima volta: riparti ${loaded ? "dallo stesso carico" : "dalle stesse ripetizioni"}, senza cercare l'aumento oggi.`,
      { title: "Rientro graduale", confidence: "medium" },
    );
  }
  if (loaded && under * 2 >= reference.length && under > 0) {
    const lighter = shift(weight, -1);
    return fromReference(
      "lower",
      lighter,
      repsMin,
      `${LastTime} ${under === 1 ? "una serie" : under + " serie"} su ${reference.length} sotto il minimo di ${repsMin}: ${next ? "la prossima volta " : ""}${assisted ? "aumenta l'assistenza" : "scendi"} a ${format(lighter)} e ricostruisci le ripetizioni.`,
    );
  }

  if (!next && tired)
    return fromReference(
      "hold",
      weight,
      inRange(anchor.reps),
      input.sore && readiness !== "low"
        ? `Hai segnato il muscolo come indolenzito: tieni ${loaded ? "lo stesso carico" : "le stesse ripetizioni"} dell'ultima volta, senza aumentare.`
        : `Il check-in di oggi indica poco recupero: tieni ${loaded ? "lo stesso carico" : "le stesse ripetizioni"} dell'ultima volta, senza aumentare.`,
    );

  const sessions = [reference, ...(input.history ?? []).map((session) => session.sets.filter(validSet))]
    .filter((sets) => sets.length)
    .slice(0, 3);
  const total = (sets: CoachSetResult[]) => sets.reduce((sum, set) => sum + set.reps, 0);
  const stalled =
    sessions.length === 3 &&
    !allAtMax &&
    sessions.every((sets) => same(sets[0].weight, reference[0].weight)) &&
    total(sessions[0]) <= total(sessions[2]) &&
    total(sessions[0]) <= total(sessions[1]);
  if (stalled) {
    flags.push("stall");
    evidence.push("Carico e ripetizioni fermi da 3 sedute");
    const hard = (maxRpe !== undefined && maxRpe >= 9) || under > 0;
    return fromReference(
      "hold",
      weight,
      inRange(anchor.reps + 1),
      hard
        ? `Da tre sedute sei ${loaded ? "fermo a " + format(reference[0].weight) : "fermo"} con sforzo alto: ${next ? "la prossima volta " : ""}allunga il recupero tra le serie e cerca una ripetizione in più solo nella prima.`
        : `Da tre sedute ${loaded ? "il carico non si muove" : "le ripetizioni non salgono"}: ${next ? "la prossima volta " : "oggi "}cerca una ripetizione in più almeno nella prima serie, anche se le altre restano uguali.`,
      { title: "Sblocca lo stallo", restBonus: hard ? 30 : 0 },
    );
  }

  const ceiling = target + (readiness === "high" ? 0.5 : 0);
  if (allAtMax && allRpe && maxRpe !== undefined && maxRpe <= ceiling) {
    if (!loaded)
      return fromReference(
        "raise",
        0,
        anchor.reps + 1,
        `${LastTime} tutte le serie a ${repsMax} ripetizioni con RPE fino a ${number(maxRpe)}: ${next ? "la prossima volta " : ""}aggiungi una ripetizione o passa a una variante più difficile.`,
      );
    const best = mode === "external" ? estimate1rm(reference[0]) : undefined;
    let steps = maxRpe <= target - 2 ? 2 : 1;
    const top = (count: number) =>
      best === undefined ? undefined : repsAt(best, shift(weight, count), 10);
    if (steps === 2 && (top(2) ?? repsMin) < repsMin) steps = 1;
    const heavier = shift(weight, steps);
    if ((top(steps) ?? repsMin) < repsMin) {
      flags.push("big-jump");
      const reps = Math.max(...reference.map((set) => set.reps)) + 1;
      return fromReference(
        "hold",
        weight,
        reps,
        `Il prossimo scatto (${change(weight, heavier)}) è troppo grande per restare tra ${repsMin} e ${repsMax} ripetizioni: resta a ${format(weight)} e arriva a ${reps}, oppure usa un incremento più piccolo.`,
        { title: "Consolida prima del salto" },
      );
    }
    const expected = best === undefined ? undefined : repsAt(best, heavier, target);
    const reps = expected === undefined ? repsMin : inRange(expected);
    return fromReference(
      "raise",
      heavier,
      reps,
      `${LastTime} tutte le serie a ${repsMax} ripetizioni con RPE fino a ${number(maxRpe)}: ${next ? "la prossima volta " : ""}prova ${format(heavier)} (${change(weight, heavier)}).`,
    );
  }
  if (allAtMax && !allRpe)
    return fromReference(
      "hold",
      weight,
      inRange(anchor.reps),
      `${LastTime} tutte le serie al massimo, ma l'RPE non è registrato in ogni serie: ripeti e segna lo sforzo, così il Coach può proporre l'aumento.`,
    );
  if (allAtMax)
    return fromReference(
      "hold",
      weight,
      inRange(anchor.reps),
      `Eri al massimo delle ripetizioni ma con sforzo alto (RPE ${number(maxRpe ?? target)}): consolida ancora una seduta prima di salire.`,
    );
  if (anchor.reps >= repsMax)
    return fromReference(
      "hold",
      weight,
      repsMax,
      `${loaded ? "Stesso carico" : "Stesse ripetizioni"} di ${lastTime}: ripeti il massimo qui e recupera le ripetizioni mancanti nelle serie successive.`,
    );
  const reps = inRange(anchor.reps + 1);
  return fromReference(
    "hold",
    weight,
    reps,
    `${loaded ? "Stesso carico" : "Stesso esercizio"} di ${lastTime}, puntando a una ripetizione in più (${anchor.reps} → ${reps}).`,
  );
}

/**
 * Consiglio per la prossima seduta, letto dalle serie appena completate.
 * Non usa check-in né pause: quelli valgono solo il giorno dell'allenamento.
 */
export function coachNextSession(
  input: Omit<CoachInput, "done" | "reference" | "readiness" | "sore" | "daysSinceReference" | "perspective"> & {
    completed: CoachSetResult[];
  },
): CoachSuggestion | null {
  const { completed, ...rest } = input;
  const sets = completed.filter(validSet);
  if (!sets.length) return null;
  return coachNextSet({ ...rest, reference: sets, done: [], setIndex: 0, perspective: "next" });
}

/**
 * Sedute completate e confrontabili (stesso esercizio, modalità di carico e configurazione)
 * precedenti a quella indicata, dalla più recente. Solo serie allenanti completate.
 */
export function coachHistory(
  data: DataSet,
  current: WorkoutLogExercise,
  limit = 4,
): CoachSession[] {
  const active = data.workouts.find((workout) => workout.id === current.workoutId);
  if (!active) return [];
  const earlier = data.workouts
    .filter(
      (workout) =>
        workout.status === "completed" &&
        workout.id !== active.id &&
        (workout.date < active.date ||
          (workout.date === active.date &&
            Date.parse(workout.startedAt) < Date.parse(active.startedAt))),
    )
    .sort((a, b) => b.date.localeCompare(a.date) || b.startedAt.localeCompare(a.startedAt));
  const sessions: CoachSession[] = [];
  for (const workout of earlier) {
    const row = data.workoutExercises.find(
      (entry) =>
        entry.workoutId === workout.id &&
        entry.exerciseId === current.exerciseId &&
        entry.loadMode === current.loadMode &&
        setupKey(entry.machineSetup) === setupKey(current.machineSetup),
    );
    if (!row) continue;
    const sets = data.sets
      .filter((set) => set.workoutExerciseId === row.id && set.completed && set.kind !== "warmup")
      .sort((a, b) => a.number - b.number)
      .map((set) => ({ weight: set.weight, reps: set.reps, rpe: set.rpe }));
    if (!sets.length) continue;
    sessions.push({ id: row.id, date: workout.date, sets });
    if (sessions.length >= limit) break;
  }
  return sessions;
}

/** Giorni interi tra due date locali AAAA-MM-GG; undefined se una delle due non è valida. */
export function daysBetween(from: string | undefined, to: string | undefined) {
  if (!from || !to) return undefined;
  const a = Date.parse(from.slice(0, 10) + "T12:00:00Z");
  const b = Date.parse(to.slice(0, 10) + "T12:00:00Z");
  if (!Number.isFinite(a) || !Number.isFinite(b)) return undefined;
  return Math.round((b - a) / 86400000);
}

/**
 * Deduce la prontezza dal check-in (scala 1-5; lo stress alto conta come negativo,
 * le ore di sonno contano quanto la qualità del sonno).
 */
export function readinessFromWellness(
  log?: {
    sleepQuality?: number;
    sleepMinutes?: number;
    energy?: number;
    stress?: number;
  } | null,
): Readiness | undefined {
  if (!log) return undefined;
  const scores: number[] = [];
  for (const value of [log.sleepQuality, log.energy])
    if (typeof value === "number" && value >= 1 && value <= 5)
      scores.push(value);
  if (typeof log.stress === "number" && log.stress >= 1 && log.stress <= 5)
    scores.push(6 - log.stress);
  if (
    typeof log.sleepMinutes === "number" &&
    Number.isFinite(log.sleepMinutes) &&
    log.sleepMinutes > 0
  ) {
    const minutes = log.sleepMinutes;
    scores.push(minutes < 300 ? 1 : minutes < 360 ? 2 : minutes < 420 ? 3 : minutes < 480 ? 4 : 5);
  }
  if (!scores.length) return undefined;
  const mean = scores.reduce((sum, value) => sum + value, 0) / scores.length;
  return mean <= 2.4 ? "low" : mean >= 4.5 && scores.length >= 2 ? "high" : "normal";
}
