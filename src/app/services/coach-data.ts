/**
 * Guida allenamento: adattatore tra l'archivio e il motore di regole.
 * Legge soltanto: nessuna scrittura sul dataset pubblicato dai Signals.
 */
import {
  CoachSetSnapshot, CoachSettingsData, DataSet, ExerciseCoachPreference, LoadMode, WorkoutLogExercise, WorkoutLogSet,
} from '../models/domain';
import { COACH_CONFIG } from './coach-config';
import {
  adviseSet, CoachExercisePlan, CoachExerciseProfile, CoachGlobalTrend, CoachSessionResult, CoachSetAdvice,
  CoachSetResult, CoachSettings, CoachTrend, compareSessions, globalTrend, planExercise, resolveSettings,
} from './coach-engine';
import { hasSetup, setupKey } from './training-flow';

export const COACH_SNAPSHOT_VERSION = 1;
const PLANNED_REDUCTIONS = ['reduce-load', 'reduce-sets', 'stall-reset'];

export const coachSettings = (data: DataSet): CoachSettings => resolveSettings(data.settings[0]?.coach);

/** RIR dichiarato ricavato dall'RPE registrato (RIR = 10 − RPE). */
export const rirFromRpe = (rpe?: number) =>
  rpe === undefined || !Number.isFinite(rpe) ? undefined : Math.max(0, Math.round((10 - rpe) * 2) / 2);

export function exerciseProfile(data: DataSet, exerciseId: string, loadMode: LoadMode): CoachExerciseProfile {
  const exercise = data.exercises.find((e) => e.id === exerciseId);
  const pref = data.exercisePreferences.find((p) => p.id === exerciseId);
  const name = (exercise?.name || '').toLocaleLowerCase('it');
  const group = (data.muscleGroups.find((g) => g.id === exercise?.muscleGroupId)?.name || '').toLocaleLowerCase('it');
  const auto = COACH_CONFIG.isolationKeywords.some((k) => name.includes(k)) || COACH_CONFIG.isolationGroups.includes(group)
    ? 'isolation' : 'compound';
  const movement = pref?.coach?.movement ?? auto;
  const safeEquipment = COACH_CONFIG.safeEquipment.includes((exercise?.equipment || '').trim().toLocaleLowerCase('it'));
  return {
    loadMode,
    movement,
    increment: pref?.weightStep && pref.weightStep > 0 ? pref.weightStep : 2.5,
    minLoad: pref?.coach?.minLoad ?? 0,
    safeForFailure: pref?.coach?.safeForFailure ?? safeEquipment,
    dropsetCompatible: pref?.coach?.dropsetCompatible ?? (safeEquipment || movement === 'isolation'),
  };
}

interface CoachIndex {
  exercisesByWorkout: Map<string, WorkoutLogExercise[]>;
  setsByExercise: Map<string, WorkoutLogSet[]>;
  completed: DataSet['workouts'];
}
const indexes = new WeakMap<DataSet, CoachIndex>();
function index(data: DataSet): CoachIndex {
  const cached = indexes.get(data);
  if (cached) return cached;
  const exercisesByWorkout = new Map<string, WorkoutLogExercise[]>();
  for (const row of data.workoutExercises) {
    const list = exercisesByWorkout.get(row.workoutId);
    if (list) list.push(row); else exercisesByWorkout.set(row.workoutId, [row]);
  }
  const setsByExercise = new Map<string, WorkoutLogSet[]>();
  for (const row of data.sets) {
    const list = setsByExercise.get(row.workoutExerciseId);
    if (list) list.push(row); else setsByExercise.set(row.workoutExerciseId, [row]);
  }
  for (const list of setsByExercise.values()) list.sort((a, b) => a.number - b.number);
  const completed = data.workouts
    .filter((w) => w.status === 'completed')
    .sort((a, b) => b.date.localeCompare(a.date) || b.startedAt.localeCompare(a.startedAt) || b.id.localeCompare(a.id));
  const built = { exercisesByWorkout, setsByExercise, completed };
  indexes.set(data, built);
  return built;
}

export const workSets = (data: DataSet, workoutExerciseId: string) =>
  (index(data).setsByExercise.get(workoutExerciseId) ?? []).filter((s) => s.kind !== 'warmup');

export function setResult(set: WorkoutLogSet): CoachSetResult {
  return {
    weight: set.weight, reps: set.reps, rir: rirFromRpe(set.rpe), flag: set.flag, drop: !!set.drop,
    plannedRir: set.coach?.rirMin,
  };
}

function sessionOf(data: DataSet, row: WorkoutLogExercise, phase?: string): CoachSessionResult | null {
  const sets = workSets(data, row.id).filter((s) => s.completed);
  if (!sets.length) return null;
  const workout = data.workouts.find((w) => w.id === row.workoutId);
  return {
    date: workout?.date ?? '',
    sets: sets.map(setResult),
    deload: sets.every((s) => s.coach?.rule === 'deload') || /scaric|deload/i.test(phase ?? workout?.programPhase ?? ''),
    plannedReduction: sets.some((s) => PLANNED_REDUCTIONS.includes(s.coach?.rule ?? '')),
  };
}

/** Sedute concluse confrontabili (stesso esercizio, modalità di carico e configurazione), più recenti per prime. */
export function comparableSessions(data: DataSet, current: WorkoutLogExercise, limit = COACH_CONFIG.thresholds.historySessions + 2) {
  const idx = index(data);
  const workout = data.workouts.find((w) => w.id === current.workoutId);
  const out: CoachSessionResult[] = [];
  for (const w of idx.completed) {
    if (out.length >= limit) break;
    if (w.id === current.workoutId || (workout && w.date > workout.date)) continue;
    const matches = (idx.exercisesByWorkout.get(w.id) ?? []).filter((e) =>
      e.exerciseId === current.exerciseId && e.loadMode === current.loadMode &&
      (!hasSetup(current.machineSetup) || setupKey(e.machineSetup) === setupKey(current.machineSetup)));
    const row = matches.find((e) => e.order === current.order) ?? matches[0];
    const session = row ? sessionOf(data, row) : null;
    if (session) out.push(session);
  }
  return out;
}

/** Tendenza generale delle ultime sedute concluse (prima della seduta indicata). */
export function trainingTrend(data: DataSet, beforeDate?: string): CoachGlobalTrend {
  const idx = index(data);
  const sessions = idx.completed.filter((w) => !beforeDate || w.date <= beforeDate).slice(0, COACH_CONFIG.globalTrend.sessions + 1);
  const rows: CoachTrend[][] = sessions.map((w) => (idx.exercisesByWorkout.get(w.id) ?? []).flatMap((row) => {
    const current = sessionOf(data, row);
    if (!current) return [];
    const previous = comparableSessions(data, row, 1)[0];
    return previous ? [compareSessions(previous, current, row.loadMode)] : [];
  }));
  return globalTrend(rows);
}

export interface CoachGuide {
  plan: CoachExercisePlan;
  profile: CoachExerciseProfile;
  history: CoachSessionResult[];
}

function planTarget(data: DataSet, row: WorkoutLogExercise) {
  const workout = data.workouts.find((w) => w.id === row.workoutId);
  const planRows = data.planExercises.filter((p) => p.dayId === workout?.dayId && p.exerciseId === row.exerciseId);
  const planRow = planRows.find((p) => p.order === row.order) ?? (planRows.length === 1 ? planRows[0] : undefined);
  const sets = workSets(data, row.id);
  const planned = sets.find((s) => s.weight > 0)?.weight ?? planRow?.targetWeight;
  return {
    sets: sets.length || planRow?.sets,
    repsMin: row.repsMin ?? planRow?.repsMin,
    repsMax: row.repsMax ?? planRow?.repsMax,
    rirMin: row.rirMin ?? planRow?.rirMin,
    rirMax: row.rirMax ?? planRow?.rirMax,
    rpe: planRow?.rpe,
    rest: row.rest || planRow?.rest,
    plannedWeight: planned,
    phaseText: workout?.programPhase,
  };
}

/** Piano della guida per tutti gli esercizi di una seduta, in ordine (limite dropset per seduta). */
export function workoutGuides(data: DataSet, workoutId: string, format?: (kg: number) => string): Map<string, CoachGuide> {
  const settings = coachSettings(data);
  const workout = data.workouts.find((w) => w.id === workoutId);
  const rows = [...(index(data).exercisesByWorkout.get(workoutId) ?? [])].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const trend = trainingTrend(data, workout?.date);
  const out = new Map<string, CoachGuide>();
  let dropsets = 0;
  for (const row of rows) {
    const profile = exerciseProfile(data, row.exerciseId, row.loadMode);
    const history = comparableSessions(data, row);
    const plan = planExercise({
      settings, exercise: profile, plan: planTarget(data, row), history, dropsetsPlanned: dropsets,
      globalDecline: trend.level === 'deload', format,
    });
    if (plan.dropsetSet) dropsets++;
    out.set(row.id, { plan, profile, history });
  }
  return out;
}

/** Suggerimento per una serie allenante, usando le serie già registrate oggi. */
export function adviceForSet(data: DataSet, guide: CoachGuide, set: WorkoutLogSet, format?: (kg: number) => string): CoachSetAdvice | null {
  if (set.kind === 'warmup') return null;
  const sets = workSets(data, set.workoutExerciseId);
  const position = sets.findIndex((s) => s.id === set.id);
  if (position < 0) return null;
  const done = sets.slice(0, position).filter((s) => s.completed).map(setResult);
  return adviseSet(guide.plan, guide.profile, position, done, { format });
}

export function snapshotOf(advice: CoachSetAdvice): CoachSetSnapshot {
  return {
    v: COACH_SNAPSHOT_VERSION, rule: advice.rule.slice(0, 40), scope: advice.scope,
    ...(advice.weight !== undefined ? { weight: advice.weight } : {}),
    repsMin: advice.repsMin, repsMax: advice.repsMax,
    ...(advice.repsTarget !== undefined ? { repsTarget: advice.repsTarget } : {}),
    rirMin: advice.rirMin, rirMax: advice.rirMax, rest: Math.min(7200, advice.rest),
    ...(advice.technique ? { technique: advice.technique.kind } : {}),
    reason: advice.reason.slice(0, 1000),
  };
}

/* Validazione condivisa da integrità e store (il Worker ha una copia equivalente in worker/archive.js). */
const isNum = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const isInt = (v: unknown, min: number, max: number) => isNum(v, min, max) && Number.isInteger(v);
const only = (value: object, keys: string[]) => Object.keys(value).every((k) => keys.includes(k));

export function validCoachSettings(value: CoachSettingsData | undefined) {
  if (value === undefined) return true;
  if (!value || typeof value !== 'object' || !only(value, ['enabled', 'goal', 'experience', 'phase', 'allowFailure', 'allowDropsets'])) return false;
  return (value.enabled === undefined || typeof value.enabled === 'boolean') &&
    (value.goal === undefined || ['hypertrophy', 'strength', 'endurance'].includes(value.goal)) &&
    (value.experience === undefined || ['beginner', 'intermediate', 'advanced'].includes(value.experience)) &&
    (value.phase === undefined || ['standard', 'intensification', 'deload'].includes(value.phase)) &&
    (value.allowFailure === undefined || typeof value.allowFailure === 'boolean') &&
    (value.allowDropsets === undefined || typeof value.allowDropsets === 'boolean');
}

export function validCoachPreference(value: ExerciseCoachPreference | undefined) {
  if (value === undefined) return true;
  if (!value || typeof value !== 'object' || !only(value, ['movement', 'minLoad', 'safeForFailure', 'dropsetCompatible'])) return false;
  return (value.movement === undefined || ['compound', 'isolation'].includes(value.movement)) &&
    (value.minLoad === undefined || isNum(value.minLoad, 0, 1000)) &&
    (value.safeForFailure === undefined || typeof value.safeForFailure === 'boolean') &&
    (value.dropsetCompatible === undefined || typeof value.dropsetCompatible === 'boolean');
}

export function validCoachSnapshot(value: CoachSetSnapshot | undefined) {
  if (value === undefined) return true;
  if (!value || typeof value !== 'object' || !only(value, ['v', 'rule', 'scope', 'weight', 'repsMin', 'repsMax', 'repsTarget', 'rirMin', 'rirMax', 'rest', 'technique', 'reason'])) return false;
  return isInt(value.v, 1, 1000) && typeof value.rule === 'string' && !!value.rule && value.rule.length <= 40 &&
    ['program', 'session'].includes(value.scope) && (value.weight === undefined || isNum(value.weight, 0, 10000)) &&
    isInt(value.repsMin, 1, 999) && isInt(value.repsMax, 1, 999) && value.repsMin <= value.repsMax &&
    (value.repsTarget === undefined || isInt(value.repsTarget, 1, 999)) &&
    isNum(value.rirMin, 0, 10) && isNum(value.rirMax, 0, 10) && value.rirMin <= value.rirMax &&
    isNum(value.rest, 0, 7200) && (value.technique === undefined || ['failure', 'dropset'].includes(value.technique)) &&
    typeof value.reason === 'string' && value.reason.length <= 1000;
}

export const validSetFlag = (value: unknown) => value === undefined || value === 'hard' || value === 'technique';
