/**
 * Guida allenamento: motore di regole deterministico.
 *
 * Funzioni pure, senza accesso all'archivio, all'orologio o a servizi esterni:
 * gli stessi dati e le stesse impostazioni producono sempre gli stessi suggerimenti,
 * ognuno con l'identificativo della regola applicata e una motivazione leggibile.
 * Tutti i carichi sono in kg; per gli esercizi assistiti il "carico" è l'assistenza,
 * quindi progredire significa ridurla.
 */
import type { LoadMode } from '../models/domain';
import {
  COACH_CONFIG, CoachConfig, CoachExperience, CoachGoal, CoachMovement, CoachPhase,
  DEFAULT_COACH_SETTINGS, EXPERIENCE_ORDER,
} from './coach-config';

export type CoachFlag = 'hard' | 'technique';

export interface CoachSettings {
  enabled: boolean;
  goal: CoachGoal;
  experience: CoachExperience;
  phase: CoachPhase;
  allowFailure: boolean;
  allowDropsets: boolean;
}

export interface CoachExerciseProfile {
  loadMode: LoadMode;
  movement: CoachMovement;
  /** Minimo incremento disponibile, in kg. */
  increment: number;
  /** Carico minimo disponibile (es. bilanciere vuoto, primo blocco della macchina). */
  minLoad: number;
  safeForFailure: boolean;
  dropsetCompatible: boolean;
}

/** Valori della scheda: hanno precedenza sui preset. */
export interface CoachPlanTarget {
  sets?: number;
  repsMin?: number;
  repsMax?: number;
  rirMin?: number;
  rirMax?: number;
  rpe?: number;
  rest?: number;
  plannedWeight?: number;
  phaseText?: string;
}

export interface CoachSetResult {
  weight: number;
  reps: number;
  /** RIR dichiarato: una stima soggettiva, mai una misura esatta. */
  rir?: number;
  flag?: CoachFlag;
  drop?: boolean;
  /** RIR prescritto dalla guida per questa serie, se registrato (es. 0 per l'ultima serie al cedimento). */
  plannedRir?: number;
}

export interface CoachSessionResult {
  date: string;
  /** Solo serie allenanti completate, in ordine. */
  sets: CoachSetResult[];
  /** Seduta di scarico: esclusa da progressione e stallo. */
  deload?: boolean;
  /** Riduzione di carico pianificata dalla guida: non conta come peggioramento. */
  plannedReduction?: boolean;
}

export interface CoachPrescription {
  sets: number;
  repsMin: number;
  repsMax: number;
  rirMin: number;
  rirMax: number;
  rest: number;
  source: { reps: 'plan' | 'preset'; rir: 'plan' | 'preset'; rest: 'plan' | 'preset' };
}

export type CoachDecision =
  | 'calibrate' | 'progress-reps' | 'extend-reps' | 'increase-load' | 'confirm-load'
  | 'hold-difficult' | 'reduce-load' | 'reduce-sets' | 'stall-hold' | 'stall-reset'
  | 'deload' | 'bodyweight-top';

export interface CoachExercisePlan {
  prescription: CoachPrescription;
  /** Carico proposto per le serie allenanti; assente = scelto dall'utente o corpo libero. */
  weight?: number;
  /** Ripetizioni obiettivo per ogni serie allenante. */
  repTargets: number[];
  /** Massimo effettivo del range (più alto se l'incremento disponibile è troppo grande). */
  topReps: number;
  decision: CoachDecision;
  reason: string;
  notes: string[];
  failureSet?: number;
  dropsetSet?: number;
  stall: boolean;
}

export interface CoachSetAdvice {
  setNumber: number;
  weight?: number;
  repsMin: number;
  repsMax: number;
  repsTarget?: number;
  rirMin: number;
  rirMax: number;
  rest: number;
  technique?: { kind: 'failure' | 'dropset'; text: string; dropWeight?: number };
  /** program = progressione tra sedute; session = aggiustamento temporaneo di oggi. */
  scope: 'program' | 'session';
  change: 'none' | 'load-up' | 'load-down' | 'rest-up';
  rule: string;
  headline: string;
  rirText: string;
  restText: string;
  reason: string;
  notes: string[];
}

export interface CoachPlanInput {
  settings?: Partial<CoachSettings>;
  exercise: CoachExerciseProfile;
  plan: CoachPlanTarget;
  /** Sedute confrontabili più recenti per prime. */
  history: CoachSessionResult[];
  /** Dropset già previste in questa seduta per gli esercizi precedenti. */
  dropsetsPlanned?: number;
  /** Tendenza generale: più esercizi in peggioramento. */
  globalDecline?: boolean;
  format?: (kg: number) => string;
  config?: CoachConfig;
}

const EPS = 0.000001;
const round = (value: number) => Math.round(value * 1000000) / 1000000;
const int = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

export const formatKg = (kg: number) =>
  kg.toLocaleString('it-IT', { maximumFractionDigits: 2 }) + ' kg';

export function resolveSettings(value?: Partial<CoachSettings>): CoachSettings {
  const base = DEFAULT_COACH_SETTINGS;
  return {
    enabled: typeof value?.enabled === 'boolean' ? value.enabled : base.enabled,
    goal: value?.goal && ['hypertrophy', 'strength', 'endurance'].includes(value.goal) ? value.goal : base.goal,
    experience: value?.experience && EXPERIENCE_ORDER.includes(value.experience) ? value.experience : base.experience,
    phase: value?.phase && ['standard', 'intensification', 'deload'].includes(value.phase) ? value.phase : base.phase,
    allowFailure: value?.allowFailure === true,
    allowDropsets: value?.allowDropsets === true,
  };
}

const atLeast = (experience: CoachExperience, min: CoachExperience) =>
  EXPERIENCE_ORDER.indexOf(experience) >= EXPERIENCE_ORDER.indexOf(min);

export const isDeloadPhase = (settings: CoachSettings, plan: CoachPlanTarget) =>
  settings.phase === 'deload' || /scaric|deload/i.test(plan.phaseText || '');

/** Prescrizione di base: valori della scheda dove presenti, altrimenti preset configurabili. */
export function resolvePrescription(
  settings: CoachSettings, exercise: CoachExerciseProfile, plan: CoachPlanTarget, config = COACH_CONFIG,
): CoachPrescription {
  const preset = config.presets[settings.goal][exercise.movement];
  const planReps = int(plan.repsMin, 1, 999) && int(plan.repsMax, 1, 999) && plan.repsMin <= plan.repsMax;
  const planRir = finite(plan.rirMin) && plan.rirMin >= 0 && plan.rirMin <= 10;
  const planRpe = finite(plan.rpe) && plan.rpe >= 1 && plan.rpe <= 10;
  const presetRir = Math.max(0, preset.rir + config.experience[settings.experience].rirOffset);
  let rirMin = planRir ? plan.rirMin! : planRpe ? Math.max(0, Math.round(10 - plan.rpe!)) : presetRir;
  let rirMax = planRir && finite(plan.rirMax) && plan.rirMax >= plan.rirMin! ? plan.rirMax : rirMin;
  let sets = int(plan.sets, 1, 60) ? plan.sets : preset.sets;
  if (isDeloadPhase(settings, plan)) {
    sets = Math.max(1, Math.round(sets * config.deload.setsFactor));
    rirMin += config.deload.rirBonus;
    rirMax += config.deload.rirBonus;
  }
  return {
    sets,
    repsMin: planReps ? plan.repsMin! : preset.repsMin,
    repsMax: planReps ? plan.repsMax! : preset.repsMax,
    rirMin,
    rirMax,
    rest: finite(plan.rest) && plan.rest > 0 ? plan.rest : preset.rest,
    source: {
      reps: planReps ? 'plan' : 'preset',
      rir: planRir || planRpe ? 'plan' : 'preset',
      rest: finite(plan.rest) && plan.rest > 0 ? 'plan' : 'preset',
    },
  };
}

const loadable = (mode: LoadMode) => mode !== 'bodyweight';
/** +1: più carico = più difficile; −1 per gli esercizi assistiti. */
const direction = (mode: LoadMode) => (mode === 'assisted' ? -1 : 1);
const harder = (mode: LoadMode, a: number, b: number) => direction(mode) * (a - b);

function shift(exercise: CoachExerciseProfile, weight: number, steps: number): number {
  const inc = exercise.increment > 0 ? exercise.increment : 2.5;
  const next = round(weight + direction(exercise.loadMode) * steps * inc);
  if (exercise.loadMode === 'assisted') return Math.max(0, next);
  return Math.max(exercise.loadMode === 'external' ? exercise.minLoad : 0, next, 0);
}

/** Riduzione di circa `ratio` del carico, sempre in multipli dell'incremento disponibile. */
function reduceBy(exercise: CoachExerciseProfile, weight: number, ratio: number) {
  const inc = exercise.increment > 0 ? exercise.increment : 2.5;
  const steps = Math.max(1, Math.round((Math.max(weight, inc) * ratio) / inc));
  return shift(exercise, weight, -steps);
}

const incrementTooBig = (exercise: CoachExerciseProfile, weight: number, config: CoachConfig) =>
  exercise.loadMode === 'external' && weight > 0 && exercise.increment / weight > config.thresholds.maxIncrementRatio + EPS;

interface SessionEval {
  weight: number;
  complete: boolean;
  considered: CoachSetResult[];
  totalReps: number;
  rirKnown: boolean;
  marginOk: boolean;
  technique: boolean;
  difficult: boolean;
  why: string;
}

function evaluate(
  session: CoachSessionResult, rx: CoachPrescription, mode: LoadMode, config: CoachConfig,
): SessionEval {
  const t = config.thresholds;
  const considered = session.sets.slice(0, rx.sets);
  const first = considered[0];
  const weight = first?.weight ?? 0;
  const technique = considered.some((s) => s.flag === 'technique');
  const flaggedHard = considered.some((s) => s.flag === 'hard');
  const belowFirst = !!first && first.reps < rx.repsMin;
  const collapsed = considered.find((s) => s.reps < rx.repsMin - t.repDropTolerance);
  const rirLow = !!first && first.rir !== undefined && first.rir <= rx.rirMin - t.muchHarderRir;
  const why = technique ? 'tecnica peggiorata segnalata'
    : flaggedHard ? 'serie segnalata più dura del previsto'
    : belowFirst ? `prima serie a ${first.reps} ripetizioni, sotto il minimo di ${rx.repsMin}`
    : collapsed ? `una serie a ${collapsed.reps} ripetizioni, ben sotto il minimo di ${rx.repsMin}`
    : rirLow ? `RIR ${first.rir} dichiarato già nella prima serie (obiettivo ${rx.rirMin})`
    : '';
  return {
    weight,
    complete: considered.length >= rx.sets,
    considered,
    totalReps: considered.reduce((sum, s) => sum + s.reps, 0),
    rirKnown: considered.length > 0 && considered.every((s) => s.rir !== undefined),
    marginOk: considered.every((s) => s.rir === undefined || s.rir >= Math.min(rx.rirMin, s.plannedRir ?? rx.rirMin) - t.rirTolerance),
    technique,
    difficult: !!why,
    why,
  };
}

const reachedTop = (ev: SessionEval, top: number, mode: LoadMode) =>
  ev.complete && ev.considered.every((s) => s.reps >= top && harder(mode, s.weight, ev.weight) >= -EPS);

const describeSets = (sets: CoachSetResult[], mode: LoadMode, fmt: (kg: number) => string) => {
  if (!loadable(mode)) return sets.map((s) => s.reps).join(', ') + ' ripetizioni';
  const same = sets.every((s) => Math.abs(s.weight - sets[0].weight) < EPS);
  return same
    ? `${sets.length}×${sets.map((s) => s.reps).join('/')} con ${fmt(sets[0].weight)}`
    : sets.map((s) => `${fmt(s.weight)}×${s.reps}`).join(', ');
};

const rirRange = (min: number, max: number) => (min === max ? String(min) : `${min}–${max}`);

/** Prescrizione dell'esercizio per la seduta di oggi: progressione tra sedute. */
export function planExercise(input: CoachPlanInput): CoachExercisePlan {
  const config = input.config ?? COACH_CONFIG;
  const t = config.thresholds;
  const fmt = input.format ?? formatKg;
  const settings = resolveSettings(input.settings);
  const { exercise, plan } = input;
  const mode = exercise.loadMode;
  const rx = resolvePrescription(settings, exercise, plan, config);
  const history = input.history.filter((s) => !s.deload && s.sets.length).slice(0, t.historySessions);
  const notes: string[] = [];
  if (rx.source.reps === 'preset') notes.push(config.presetNotes[settings.goal]);
  if (input.globalDecline)
    notes.push('In più esercizi le ultime sedute sono andate peggio delle precedenti: valuta una settimana di scarico (Profilo › Guida allenamento › Fase). Non ho dati sufficienti per indicarne la causa.');
  const fill = (n: number, sets = rx.sets) => Array.from({ length: sets }, () => n);
  const result = (partial: Omit<CoachExercisePlan, 'prescription' | 'notes' | 'stall' | 'topReps'> & { stall?: boolean; topReps?: number }) => {
    const out: CoachExercisePlan = { prescription: rx, notes, stall: false, topReps: rx.repsMax, ...partial };
    return assignTechniques(out, input, settings, history, config);
  };
  const rirWords = `restando a ${rirRange(rx.rirMin, rx.rirMax)} ripetizion${rx.rirMax === 1 ? 'e' : 'i'} dal limite`;

  // 1. Scarico: meno serie, carico ridotto, lontano dal limite. La progressione è sospesa.
  if (isDeloadPhase(settings, plan)) {
    const base = history[0]?.sets[0]?.weight ?? (finite(plan.plannedWeight) && plan.plannedWeight > 0 ? plan.plannedWeight : undefined);
    const weight = base !== undefined && loadable(mode) ? reduceBy(exercise, base, config.deload.loadRatio) : undefined;
    const original = int(plan.sets, 1, 60) ? plan.sets : config.presets[settings.goal][exercise.movement].sets;
    return result({
      decision: 'deload', weight, repTargets: fill(rx.repsMin),
      reason: `Fase di scarico: ${rx.sets} serie invece di ${original}${weight !== undefined ? `, carico ridotto a ${fmt(weight)} (circa −${Math.round(config.deload.loadRatio * 100)}%)` : ''}, ${rirWords}. La progressione riprende dopo lo scarico.`,
    });
  }

  // 2. Nessuno storico confrontabile: calibrazione con carico scelto dall'utente.
  if (!history.length) {
    const planned = finite(plan.plannedWeight) && plan.plannedWeight > 0 && loadable(mode) ? plan.plannedWeight : undefined;
    return result({
      decision: 'calibrate', weight: planned, repTargets: fill(rx.repsMin),
      reason: planned !== undefined
        ? `Prima seduta registrata con questo esercizio: parti da ${fmt(planned)} (valore della scheda) e regola dopo la prima serie.`
        : loadable(mode)
          ? `Nessuna seduta precedente: scegli un carico con cui pensi di arrivare a ${rx.repsMin}–${rx.repsMax} ripetizioni ${rirWords}. Dopo la prima serie ti dico se aggiustarlo.`
          : `Nessuna seduta precedente: esegui ${rx.repsMin}–${rx.repsMax} ripetizioni ${rirWords}.`,
    });
  }

  const evals = history.map((s) => evaluate(s, rx, mode, config));
  const last = evals[0];
  const base = last.weight;
  const lastText = `La scorsa volta (${history[0].date.split('-').reverse().join('/')}): ${describeSets(last.considered, mode, fmt)}.`;

  // 3. Difficoltà: una seduta isolata non provoca regressioni; difficoltà ripetute sì.
  let streak = 0;
  while (streak < evals.length && evals[streak].difficult) streak++;
  if (streak >= t.difficultSessionsBeforeFewerSets) {
    const sets = Math.max(1, rx.sets - 1);
    const weight = loadable(mode) ? reduceBy(exercise, base, t.resetLoadRatio) : undefined;
    rx.sets = sets;
    return result({
      decision: 'reduce-sets', weight, repTargets: fill(rx.repsMin, sets),
      reason: `Difficoltà in ${streak} sedute di fila (ultima: ${last.why}). Per qualche seduta: ${sets} serie${weight !== undefined ? ` con ${fmt(weight)}` : ''}, poi si riprende a progredire. Le cause possono essere diverse (recupero, sonno, stress, tecnica): con i dati registrati non posso stabilirle.`,
    });
  }
  if (streak >= t.difficultSessionsBeforeReduce) {
    const lowered = loadable(mode) ? shift(exercise, base, -1) : undefined;
    const tooFar = lowered !== undefined && base > 0 && Math.abs(base - lowered) / base > t.maxSessionChangeRatio + EPS;
    return result({
      decision: tooFar || lowered === undefined ? 'hold-difficult' : 'reduce-load',
      weight: tooFar ? base : lowered, repTargets: fill(rx.repsMin),
      reason: tooFar || lowered === undefined
        ? `Due sedute di fila più dure del previsto (ultima: ${last.why}). Il primo carico più basso disponibile sarebbe un calo troppo grande: resta su ${loadable(mode) ? fmt(base) : 'questa variante'} e punta al minimo del range (${rx.repsMin}).`
        : `Due sedute di fila più dure del previsto (ultima: ${last.why}). Scendi di un incremento a ${fmt(lowered!)} e ricostruisci le ripetizioni.`,
    });
  }
  if (streak === 1) {
    return result({
      decision: 'hold-difficult', weight: loadable(mode) ? base : undefined,
      repTargets: Array.from({ length: rx.sets }, (_, i) => Math.min(rx.repsMax, Math.max(rx.repsMin, last.considered[i]?.reps ?? rx.repsMin))),
      reason: `${lastText} È stata più dura del previsto (${last.why}). Una sola seduta negativa non basta per tornare indietro: stesso carico, prova a ripetere le stesse ripetizioni.`,
    });
  }

  // 4. Doppia progressione: prima le ripetizioni, poi il carico.
  const tooBig = incrementTooBig(exercise, base, config);
  const topReps = tooBig ? rx.repsMax + t.extraRepsWhenIncrementTooBig[settings.goal] : rx.repsMax;
  if (reachedTop(last, topReps, mode) && last.marginOk && !last.technique) {
    const confirmed = last.rirKnown || evals.slice(0, t.confirmSessionsWithoutRir).length >= t.confirmSessionsWithoutRir &&
      evals.slice(0, t.confirmSessionsWithoutRir).every((ev) => Math.abs(ev.weight - base) < EPS && reachedTop(ev, topReps, mode) && ev.marginOk && !ev.technique && !ev.difficult);
    if (!confirmed)
      return result({
        decision: 'confirm-load', weight: loadable(mode) ? base : undefined, repTargets: fill(topReps), topReps,
        reason: `${lastText} Hai raggiunto ${topReps} ripetizioni in tutte le serie, ma senza RIR registrato non so quanto margine ti restava. Ripeti questo carico: se lo confermi${t.confirmSessionsWithoutRir > 2 ? ` per ${t.confirmSessionsWithoutRir - 1} sedute` : ''}, la prossima volta aumento. Registrare il RIR rende la guida più precisa.`,
      });
    if (!loadable(mode))
      return result({
        decision: 'bodyweight-top', repTargets: fill(topReps), topReps,
        reason: `${lastText} Hai completato tutte le serie al massimo del range con il margine richiesto. Per progredire scegli una variante più difficile o aggiungi una zavorra: la scelta resta tua.`,
      });
    if (mode === 'assisted' && base <= EPS)
      return result({
        decision: 'bodyweight-top', weight: 0, repTargets: fill(topReps), topReps,
        reason: `${lastText} Hai completato tutte le serie senza assistenza al massimo del range: puoi passare alla versione libera o zavorrata.`,
      });
    const next = shift(exercise, base, 1);
    return result({
      decision: 'increase-load', weight: next, repTargets: fill(rx.repsMin),
      reason: `${lastText} Hai completato tutte le serie al limite superiore del range (${topReps}) con il margine previsto. Oggi prova ${fmt(next)}${mode === 'assisted' ? ' di assistenza' : ''}: è normale ripartire dalla parte bassa del range (${rx.repsMin}–${rx.repsMax}).${tooBig ? ` Il salto disponibile è grande rispetto al carico: se scendi sotto ${rx.repsMin} ripetizioni, resta su questo carico finché rientri nel range.` : ''}`,
    });
  }

  // 5. Stallo: stesso carico per più sedute senza miglioramento delle ripetizioni totali.
  let same = 0;
  while (same < evals.length && Math.abs(evals[same].weight - base) < EPS && evals[same].complete) same++;
  const stalled = (n: number) => same >= n && evals[0].totalReps <= evals[n - 1].totalReps;
  const totals = (n: number) => evals.slice(0, n).reverse().map((ev) => ev.totalReps).join(' → ');
  if (loadable(mode) && stalled(t.stallResetSessions)) {
    const weight = reduceBy(exercise, base, t.resetLoadRatio);
    return result({
      decision: 'stall-reset', weight, repTargets: fill(rx.repsMin), stall: true,
      reason: `Stallo: da ${t.stallResetSessions} sedute con ${fmt(base)} le ripetizioni totali non salgono (${totals(t.stallResetSessions)}). Proposta: riparti da ${fmt(weight)} (circa −${Math.round(t.resetLoadRatio * 100)}%) e ricostruisci con la doppia progressione.`,
    });
  }
  const repTargets = Array.from({ length: rx.sets }, (_, i) => {
    const previous = last.considered[i] ?? last.considered.at(-1);
    if (!previous) return rx.repsMin;
    const room = previous.rir === undefined || previous.rir >= rx.rirMin;
    return Math.min(topReps, Math.max(rx.repsMin, previous.reps + (room ? 1 : 0)));
  });
  if (stalled(t.stallSessions)) {
    rx.rest += t.extraRestSeconds;
    return result({
      decision: 'stall-hold', weight: loadable(mode) ? base : undefined, repTargets, topReps, stall: true,
      reason: `Stallo su questo esercizio: ${t.stallSessions} sedute${loadable(mode) ? ` con ${fmt(base)}` : ''} senza aumentare le ripetizioni totali (${totals(t.stallSessions)}). Mantieni il carico e recupera ${t.extraRestSeconds} s in più; se lo stallo continua, ti propongo di ripartire con un carico leggermente più basso.`,
    });
  }
  const extension = tooBig && last.complete && last.considered.every((s) => s.reps >= rx.repsMax);
  return result({
    decision: extension ? 'extend-reps' : 'progress-reps', weight: loadable(mode) ? base : undefined, repTargets, topReps,
    reason: extension
      ? `${lastText} L’incremento disponibile (${fmt(exercise.increment)}) supera il ${Math.round(t.maxIncrementRatio * 100)}% del carico: prima di aumentare porta tutte le serie a ${topReps} ripetizioni.`
      : `${lastText} Stesso carico: aggiungi una ripetizione dove puoi, ${rirWords}. Quando tutte le serie arrivano a ${topReps}, aumento il carico.${last.complete ? '' : ` La scorsa volta mancavano serie rispetto alle ${rx.sets} previste.`}`,
  });
}

/** Cedimento e dropset: mai predefiniti, solo se abilitati e compatibili. */
function assignTechniques(
  out: CoachExercisePlan, input: CoachPlanInput, settings: CoachSettings, history: CoachSessionResult[], config: CoachConfig,
): CoachExercisePlan {
  const blocked = ['deload', 'hold-difficult', 'reduce-load', 'reduce-sets', 'stall-reset', 'calibrate'].includes(out.decision);
  if (blocked || isDeloadPhase(settings, input.plan)) return out;
  const { exercise } = input;
  const dropOk = settings.allowDropsets && atLeast(settings.experience, config.dropset.minExperience) &&
    exercise.dropsetCompatible && exercise.loadMode === 'external' && (input.dropsetsPlanned ?? 0) < config.dropset.maxPerWorkout &&
    history.slice(0, Math.max(0, config.dropset.everySessions - 1)).every((s) => !s.sets.some((x) => x.drop));
  if (dropOk) return { ...out, dropsetSet: out.prescription.sets };
  const failureOk = settings.allowFailure && atLeast(settings.experience, config.failure.minExperience) &&
    config.failure.phases.includes(settings.phase) && (exercise.movement === 'isolation' || exercise.safeForFailure);
  return failureOk ? { ...out, failureSet: out.prescription.sets } : out;
}

export function rirText(min: number, max: number) {
  if (max <= 0)
    return 'Arriva al cedimento tecnico: fermati dopo l’ultima ripetizione completa con tecnica corretta. Non tentare una ripetizione che non riusciresti a completare.';
  if (min === max) return `Fermati quando pensi di poter fare ancora ${min} ripetizion${min === 1 ? 'e' : 'i'}.`;
  return `Fermati quando pensi di poter fare ancora ${min}–${max} ripetizioni.`;
}

export function restText(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  if (s < 60) return `${s} secondi`;
  const m = Math.floor(s / 60), r = s % 60;
  return r ? `${m} min ${r} s` : `${m} minut${m === 1 ? 'o' : 'i'}`;
}

/**
 * Prescrizione della prossima serie allenante, confermata o corretta dai risultati
 * di oggi. Gli aggiustamenti valgono solo per la seduta in corso.
 */
export function adviseSet(
  plan: CoachExercisePlan,
  exercise: CoachExerciseProfile,
  setIndex: number,
  done: CoachSetResult[],
  options: { format?: (kg: number) => string; config?: CoachConfig; calibrating?: boolean } = {},
): CoachSetAdvice {
  const config = options.config ?? COACH_CONFIG;
  const t = config.thresholds;
  const fmt = options.format ?? formatKg;
  const rx = plan.prescription;
  const mode = exercise.loadMode;
  const number = setIndex + 1;
  const notes: string[] = [];
  let weight = plan.weight;
  let repsTarget: number | undefined = plan.repTargets[setIndex] ?? plan.repTargets.at(-1);
  let rest = rx.rest;
  let rirMin = rx.rirMin, rirMax = rx.rirMax;
  let scope: CoachSetAdvice['scope'] = 'program';
  let change: CoachSetAdvice['change'] = 'none';
  let rule: string = plan.decision;
  let reason = plan.reason;
  const previous = done.slice(0, setIndex);
  const struggle = previous.some((s, i) => s.flag || s.reps < rx.repsMin - (i ? t.repDropTolerance : 0));

  const last = previous.at(-1);
  if (last) {
    scope = 'session';
    const lastIndex = previous.length - 1;
    const expected = plan.repTargets[lastIndex] ?? rx.repsMin;
    const lastRirMin = plan.failureSet === lastIndex + 1 ? 0 : rx.rirMin;
    const lastRirMax = plan.failureSet === lastIndex + 1 ? 0 : rx.rirMax;
    const calibrating = options.calibrating ?? plan.decision === 'calibrate';
    const current = last.weight;
    weight = loadable(mode) ? current : undefined;
    const severe = last.flag === 'technique' || last.reps < rx.repsMin - (lastIndex ? t.repDropTolerance : 0);
    const hard = !severe && (last.flag === 'hard' || (last.rir !== undefined && last.rir <= lastRirMin - t.muchHarderRir));
    const easy = !severe && !hard && (last.rir !== undefined
      ? last.rir >= lastRirMax + t.tooEasyRir - (calibrating ? 1 : 0) && last.reps >= Math.min(expected, plan.topReps)
      : last.reps >= plan.topReps + t.tooEasyRepsOverMax - (calibrating ? 1 : 0));
    const firstWeight = previous[0].weight;
    const movedDown = harder(mode, current, firstWeight) < -EPS, movedUp = harder(mode, current, firstWeight) > EPS;
    const within = (next: number) => calibrating || current <= 0 || Math.abs(next - current) / current <= t.maxSessionChangeRatio + EPS;
    const tag = `Serie ${lastIndex + 1}`;
    if (severe) {
      const lowered = loadable(mode) ? shift(exercise, current, -1) : current;
      if (loadable(mode) && Math.abs(lowered - current) > EPS && within(lowered) && !movedUp) {
        weight = lowered; change = 'load-down'; rule = 'session-load-down';
        reason = last.flag === 'technique'
          ? `${tag}: hai segnalato che la tecnica è peggiorata. Scendi a ${fmt(lowered)} per mantenere un’esecuzione pulita.`
          : `${tag}: ${last.reps} ripetizioni, sotto il minimo di ${rx.repsMin}. Scendi a ${fmt(lowered)} per restare nel range.`;
      } else {
        rest += t.extraRestSeconds * 2; change = 'rest-up'; rule = 'session-rest-up';
        reason = `${tag}: ${last.flag === 'technique' ? 'tecnica peggiorata' : `${last.reps} ripetizioni, sotto il minimo di ${rx.repsMin}`}. ${loadable(mode) && !movedUp ? 'Il carico più basso disponibile sarebbe un calo troppo grande: ' : ''}mantieni ${loadable(mode) ? fmt(current) : 'la variante'}, recupera ${t.extraRestSeconds * 2} s in più e punta almeno a ${rx.repsMin}.`;
      }
      repsTarget = rx.repsMin;
    } else if (hard) {
      rest += t.extraRestSeconds; change = 'rest-up'; rule = 'session-rest-up';
      repsTarget = Math.max(rx.repsMin, Math.min(last.reps, plan.topReps));
      reason = `${tag} più dura del previsto${last.rir !== undefined ? ` (RIR ${last.rir}, obiettivo ${rirRange(lastRirMin, lastRirMax)})` : ''}: stesso carico, recupera ${t.extraRestSeconds} s in più.`;
    } else if (easy && loadable(mode) && !movedDown && !(mode === 'assisted' && current <= EPS)) {
      const raised = shift(exercise, current, 1);
      if (within(raised)) {
        weight = raised; change = 'load-up'; rule = 'session-load-up';
        repsTarget = rx.repsMin;
        reason = `${tag} più facile del previsto${last.rir !== undefined ? ` (RIR ${last.rir}, obiettivo ${rirRange(lastRirMin, lastRirMax)})` : ` (${last.reps} ripetizioni)`}: prova ${fmt(raised)}.`;
      } else {
        repsTarget = plan.topReps; rule = 'session-hold-top';
        reason = `${tag} facile, ma l’incremento disponibile è troppo grande per oggi: resta su ${fmt(current)} e punta a ${plan.topReps} ripetizioni.`;
      }
    } else {
      rule = 'session-hold';
      const before = previous.at(-2);
      const drop = before && Math.abs(before.weight - last.weight) < EPS ? before.reps - last.reps : 0;
      repsTarget = Math.min(plan.topReps, Math.max(rx.repsMin, Math.min(repsTarget ?? last.reps, last.reps)));
      reason = drop > 0
        ? `${tag}: ${drop} ripetizion${drop === 1 ? 'e' : 'i'} in meno della precedente, un calo normale con la fatica. Nessuna modifica.`
        : `${tag} nel target: mantieni ${loadable(mode) ? fmt(current) : 'la stessa esecuzione'}. Un calo di 1–2 ripetizioni nelle prossime serie è normale.`;
      if ((easy && movedDown) || ((severe || hard) && movedUp)) notes.push('Ho già cambiato il carico in questa seduta: evito di modificarlo di nuovo per piccole differenze.');
    }
    if (change !== 'none') notes.push('Aggiustamento solo per oggi: la progressione del programma si decide a fine seduta, dai risultati registrati.');
  }

  let technique: CoachSetAdvice['technique'];
  if (plan.failureSet === number) {
    if (struggle) notes.push('Ultima serie al cedimento annullata: oggi la seduta è più dura del previsto.');
    else {
      rirMin = 0; rirMax = 0;
      technique = { kind: 'failure', text: 'Ultima serie fino al cedimento tecnico (RIR 0): fermati quando la prossima ripetizione non sarebbe eseguibile con tecnica corretta. Non serve un tentativo fallito; usa una macchina o un appoggio sicuro.' };
    }
  }
  if (plan.dropsetSet === number) {
    if (struggle) notes.push('Dropset annullata: oggi la seduta è più dura del previsto.');
    else if (weight !== undefined && weight > 0) {
      const inc = exercise.increment > 0 ? exercise.increment : 2.5;
      const dropWeight = Math.max(exercise.minLoad, round(Math.round((weight * (1 - config.dropset.loadReduction)) / inc) * inc));
      technique = {
        kind: 'dropset', dropWeight,
        text: `Dropset dopo questa serie: scendi subito a ${fmt(dropWeight)} (circa −${Math.round(config.dropset.loadReduction * 100)}%), senza recupero, e fermati quando ti resta circa ${config.dropset.stopRir} ripetizione. Una sola discesa, poi recupero normale. Conta come lavoro aggiuntivo.`,
      };
    }
  }
  const range = `${rx.repsMin}${plan.topReps !== rx.repsMin ? '–' + plan.topReps : ''}`;
  return {
    setNumber: number, weight, repsMin: rx.repsMin, repsMax: plan.topReps, repsTarget, rirMin, rirMax, rest,
    technique, scope, change, rule,
    headline: `Serie ${number}: ${range} ripetizioni${weight !== undefined && loadable(mode) ? ` con ${fmt(weight)}${mode === 'assisted' ? ' di assistenza' : ''}` : ''}.`,
    rirText: rirText(rirMin, rirMax),
    restText: `Recupero: ${restText(rest)}.`,
    reason, notes,
  };
}

export type CoachTrend = 'up' | 'flat' | 'down';

/** Confronta due sedute dello stesso esercizio. */
export function compareSessions(previous: CoachSessionResult, current: CoachSessionResult, mode: LoadMode, config = COACH_CONFIG): CoachTrend {
  if (!previous.sets.length || !current.sets.length) return 'flat';
  if (current.sets.some((s) => s.flag)) return 'down';
  if (current.plannedReduction || current.deload || previous.deload) return 'flat';
  const delta = harder(mode, current.sets[0].weight, previous.sets[0].weight);
  const n = Math.min(previous.sets.length, current.sets.length);
  const reps = (s: CoachSessionResult) => s.sets.slice(0, n).reduce((sum, x) => sum + x.reps, 0);
  if (delta > EPS) return 'up';
  if (delta < -EPS) return reps(current) <= reps(previous) ? 'down' : 'flat';
  const diff = reps(current) - reps(previous);
  return diff >= 1 ? 'up' : diff <= -config.globalTrend.repsDrop ? 'down' : 'flat';
}

export interface CoachGlobalTrend {
  level: 'none' | 'watch' | 'deload';
  streak: number;
  declined: number;
  compared: number;
  message: string;
}

/**
 * Tendenza su più esercizi: `workouts` contiene, per ogni seduta conclusa (più recente
 * per prima), il confronto di ciascun esercizio con la sua seduta precedente.
 */
export function globalTrend(workouts: CoachTrend[][], config = COACH_CONFIG): CoachGlobalTrend {
  const g = config.globalTrend;
  const declining = (rows: CoachTrend[]) =>
    rows.length >= g.minExercises && rows.filter((r) => r === 'down').length / rows.length >= g.declineShare;
  let streak = 0;
  while (streak < workouts.length && declining(workouts[streak])) streak++;
  const latest = workouts[0] ?? [];
  const declined = latest.filter((r) => r === 'down').length;
  if (streak >= g.sessions)
    return { level: 'deload', streak, declined, compared: latest.length, message: `Nelle ultime ${streak} sedute più esercizi sono peggiorati (ultima: ${declined} su ${latest.length}). Non è un singolo esercizio in stallo: valuta una settimana di scarico o qualche seduta con meno serie. Con i dati registrati non posso stabilirne la causa.` };
  if (streak === 1)
    return { level: 'watch', streak, declined, compared: latest.length, message: `Nell’ultima seduta ${declined} esercizi su ${latest.length} sono andati peggio della volta precedente. Una seduta storta capita: per ora nessuna modifica.` };
  return { level: 'none', streak: 0, declined, compared: latest.length, message: '' };
}
