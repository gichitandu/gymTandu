/** Pure, conservative adapters for GymTrack a7b15bb. Stored weights are kg. */
import type { DataSet, Exercise as NativeExercise, WorkoutLogExercise, WorkoutLogSet } from '../models/domain';
import { CATALOG, DEFAULT_PROFILE } from '../coach/index';
import type { ActualSet, ExercisePrescription, Profile, TrainingPlan, WorkoutHistory } from '../coach/models';
import { setupKey } from './training-flow';

const META_START = '\n[GT_COACH_V1]\n';
const META_END = '\n[/GT_COACH_V1]';
const FEEDBACK_START = '\n[GT_COACH_FEEDBACK_V1]\n';
const FEEDBACK_END = '\n[/GT_COACH_FEEDBACK_V1]';
const normalize = (value: string) => value.normalize('NFC').trim().toLocaleLowerCase('it');

/** Presentation helper: preserve serialized decisions in storage, hide them in prose. */
export function coachVisibleText(text?: string): string {
  let result = text ?? '';
  for (const [startMarker, endMarker] of [[META_START, META_END], [FEEDBACK_START, FEEDBACK_END]]) {
    let start = result.indexOf(startMarker);
    while (start >= 0) {
      const end = result.indexOf(endMarker, start + startMarker.length);
      if (end < 0) break;
      result = result.slice(0, start) + result.slice(end + endMarker.length);
      start = result.indexOf(startMarker);
    }
  }
  return result.trim();
}

/** Replaces the user's editable prose while retaining structured feedback. */
export function replaceVisibleSetNotes(original: string | undefined, visible: string): string {
  const result = replaceCoachVisibleText(original, visible);
  if (result.length > 2000) throw Error('Le note della serie sono troppo lunghe.');
  return result;
}

/** Safe prose editing for plan descriptions/references as well as set notes. */
export function replaceCoachVisibleText(original: string | undefined, visible: string): string {
  const source = original ?? '';
  const metadata: string[] = [];
  for (const [startMarker, endMarker] of [[META_START, META_END], [FEEDBACK_START, FEEDBACK_END]]) {
    let offset = 0;
    while (offset < source.length) {
      const start = source.indexOf(startMarker, offset);
      const end = source.indexOf(endMarker, start + startMarker.length);
      if (start < 0 || end < 0) break;
      metadata.push(source.slice(start, end + endMarker.length));
      offset = end + endMarker.length;
    }
  }
  const result = coachVisibleText(visible) + metadata.join('');
  if (result.length > 10000) throw Error('Testo e metadati del coach superano il limite previsto.');
  return result;
}

/** Exact ids, names and equipment from the inspected upstream catalogue.
 * Renamed entries and variants are deliberately NOT silently matched. */
export const NATIVE_CATALOG_MAP: ReadonlyArray<{ nativeId: string; coreId: string; name: string; equipment: string }> = [
  { nativeId: 'exercise-0', coreId: 'barbell-bench-press', name: 'Panca piana', equipment: 'Bilanciere' },
  { nativeId: 'exercise-2', coreId: 'cable-fly', name: 'Croci ai cavi', equipment: 'Cavi' },
  { nativeId: 'exercise-3', coreId: 'machine-chest-press', name: 'Chest press', equipment: 'Macchina' },
  { nativeId: 'exercise-4', coreId: 'machine-lat-pulldown', name: 'Lat machine', equipment: 'Cavi' },
  { nativeId: 'exercise-5', coreId: 'barbell-row', name: 'Rematore bilanciere', equipment: 'Bilanciere' },
  { nativeId: 'exercise-6', coreId: 'cable-row', name: 'Pulley', equipment: 'Cavi' },
  { nativeId: 'exercise-8', coreId: 'dumbbell-shoulder-press', name: 'Shoulder press', equipment: 'Manubri' },
  { nativeId: 'exercise-9', coreId: 'dumbbell-lateral-raise', name: 'Alzate laterali', equipment: 'Manubri' },
  { nativeId: 'exercise-11', coreId: 'barbell-squat', name: 'Squat', equipment: 'Bilanciere' },
  { nativeId: 'exercise-12', coreId: 'machine-leg-press', name: 'Leg press', equipment: 'Macchina' },
  { nativeId: 'exercise-13', coreId: 'machine-leg-extension', name: 'Leg extension', equipment: 'Macchina' },
  { nativeId: 'exercise-15', coreId: 'barbell-rdl', name: 'Stacco rumeno', equipment: 'Bilanciere' },
  { nativeId: 'exercise-17', coreId: 'dumbbell-curl', name: 'Curl manubri', equipment: 'Manubri' },
  { nativeId: 'exercise-18', coreId: 'cable-pushdown', name: 'Pushdown cavo', equipment: 'Cavi' },
  { nativeId: 'library-dumbbells_dumbbell_bench_press', coreId: 'dumbbell-bench-press', name: 'Panca piana con manubri (0°)', equipment: 'Manubri' },
  { nativeId: 'library-machine_butterfly', coreId: 'machine-pec-deck', name: 'Pectoral machine', equipment: 'Macchina' },
  { nativeId: 'library-bodyweight_push_ups', coreId: 'bodyweight-pushup', name: 'Piegamenti a terra', equipment: 'Corpo libero' },
  { nativeId: 'library-dumbbells_one_arm_dumbbell_row', coreId: 'dumbbell-row', name: 'Rematore manubrio', equipment: 'Manubri' },
  { nativeId: 'library-machine_leverage_iso_row', coreId: 'machine-row', name: 'Rematore alla macchina', equipment: 'Macchina' },
  { nativeId: 'library-barbell_overhead_press', coreId: 'barbell-overhead-press', name: 'Military press', equipment: 'Bilanciere' },
  { nativeId: 'library-cable_standing_low_pulley_deltoid_raise', coreId: 'cable-lateral-raise', name: 'Alzate laterali al cavo', equipment: 'Cavi' },
  { nativeId: 'library-machine_shoulder_military_press', coreId: 'machine-shoulder-press', name: 'Shoulder press macchina', equipment: 'Macchina' },
  { nativeId: 'library-dumbbells_db_goblet_squat', coreId: 'dumbbell-goblet-squat', name: 'Goblet squat', equipment: 'Manubri' },
  { nativeId: 'library-machine_seated_leg_curl', coreId: 'machine-leg-curl', name: 'Leg curl seduto', equipment: 'Macchina' },
  { nativeId: 'library-bodyweight_air_squats', coreId: 'bodyweight-squat', name: 'Squat a corpo libero', equipment: 'Corpo libero' },
  { nativeId: 'library-bodyweight_glute_bridge', coreId: 'bodyweight-glute-bridge', name: 'Ponte glutei', equipment: 'Corpo libero' },
  { nativeId: 'library-bodyweight_dead_bug', coreId: 'bodyweight-dead-bug', name: 'Dead bug', equipment: 'Corpo libero' },
];

export function nativeToCore(exercise: NativeExercise | undefined): string | null {
  if (!exercise) return null;
  const tagged = exercise.tags.find(tag => tag.startsWith('gt-coach:'))?.slice(9);
  if (tagged && exercise.id === `coach-exercise-${tagged}` && CATALOG.some(row => row.id === tagged)) return tagged;
  const match = NATIVE_CATALOG_MAP.find(row => row.nativeId === exercise.id && normalize(row.name) === normalize(exercise.name) && normalize(row.equipment) === normalize(exercise.equipment));
  return match?.coreId ?? null;
}

export function coreToNative(data: DataSet, coreId: string): NativeExercise | undefined {
  return data.exercises.find(row => row.active && nativeToCore(row) === coreId);
}

export function equipmentIdentity(exerciseId: string, setup?: WorkoutLogExercise['machineSetup']): string {
  const key = setupKey(setup);
  return `${exerciseId}|${key === '|||' ? 'setup-not-recorded' : key}`;
}

function encodeMetadata(data: unknown): string {
  const result = `${META_START}${JSON.stringify(data)}${META_END}`;
  if (result.length > 8500) throw Error('Metadati del coach troppo estesi: esporta il piano e verifica la configurazione.');
  return result;
}

export function readCoachMetadata<T>(text?: string): T | null {
  if (!text || text.length > 10000) return null;
  const start = text.indexOf(META_START), end = text.indexOf(META_END, start + META_START.length);
  if (start < 0 || end < 0) return null;
  try { return JSON.parse(text.slice(start + META_START.length, end)) as T; } catch { return null; }
}

export interface SetFeedback { technique: 'good' | 'degraded' | 'unknown'; pain: boolean; rir?: number | null; }
export function readSetFeedback(notes?: string): SetFeedback | null {
  if (!notes) return null;
  const start = notes.indexOf(FEEDBACK_START), end = notes.indexOf(FEEDBACK_END, start + FEEDBACK_START.length);
  if (start < 0 || end < 0) return null;
  try {
    const value = JSON.parse(notes.slice(start + FEEDBACK_START.length, end));
    if (!['good', 'degraded', 'unknown'].includes(value.technique) || typeof value.pain !== 'boolean') return null;
    if (value.rir != null && (!Number.isFinite(value.rir) || value.rir < 0 || value.rir > 10)) return null;
    return value as SetFeedback;
  } catch { return null; }
}

export function annotateSetNotes(notes: string | undefined, feedback: SetFeedback): string {
  if (!['good', 'degraded', 'unknown'].includes(feedback.technique) || typeof feedback.pain !== 'boolean' || feedback.rir != null && (!Number.isFinite(feedback.rir) || feedback.rir < 0 || feedback.rir > 10)) throw Error('Feedback della serie non valido.');
  const source = notes ?? '', start = source.indexOf(FEEDBACK_START), end = source.indexOf(FEEDBACK_END, start + FEEDBACK_START.length);
  const clean = start >= 0 && end >= 0 ? source.slice(0, start) + source.slice(end + FEEDBACK_END.length) : source;
  const result = `${clean}${FEEDBACK_START}${JSON.stringify(feedback)}${FEEDBACK_END}`;
  if (result.length > 1900) throw Error('Le note della serie sono troppo lunghe per aggiungere il feedback del coach.');
  return result;
}

export function actualSetFromNative(set: WorkoutLogSet, loadKnown = true): ActualSet {
  const feedback = readSetFeedback(set.notes);
  // Explicit RIR wins. Legacy valid RPE is an approximate self-report proxy, never measured RIR.
  const rir = feedback?.rir !== undefined ? feedback.rir : Number.isFinite(set.rpe) && set.rpe! >= 1 && set.rpe! <= 10 ? 10 - set.rpe! : null;
  return { reps: set.reps, loadKg: loadKnown ? set.weight : null, rir,
    kind: set.kind === 'warmup' ? 'warmup' : 'working',
    technique: feedback?.technique ?? 'unknown', pain: feedback?.pain ?? false };
}

interface PrescriptionMetadata { schema: 1; version: string; prescription: ExercisePrescription; }
interface PlanMetadata { schema: 1; version: string; corePlanId: string; profile: Profile; }

export function getWorkoutPrescription(exercise: WorkoutLogExercise): ExercisePrescription | null {
  const metadata = readCoachMetadata<PrescriptionMetadata>(exercise.reference);
  const item = metadata?.prescription;
  const core = item ? CATALOG.find(row => row.id === item.exerciseId) : undefined;
  if (metadata?.schema !== 1 || typeof metadata.version !== 'string' || !item || !core
    || !Number.isInteger(item.sets) || item.sets < 1 || item.sets > 30
    || !Number.isInteger(item.repsMin) || item.repsMin < 1 || !Number.isInteger(item.repsMax) || item.repsMax < item.repsMin || item.repsMax > 999
    || !Number.isFinite(item.rir) || item.rir < 0 || item.rir > 10 || !Number.isFinite(item.restSeconds) || item.restSeconds < 0 || item.restSeconds > 7200
    || item.loadKg !== null && (!Number.isFinite(item.loadKg) || item.loadKg < 0)
    || !Array.isArray(item.decisions) || !Array.isArray(item.alternatives) || typeof item.equipmentKey !== 'string'
    || item.loadType !== core.loadType || typeof item.calibration !== 'boolean'
    || !['initial', 'limited', 'established'].includes(item.confidence) || typeof item.failureAllowedLastSet !== 'boolean'
    || item.dropSet && (item.dropSet.maxDrops !== 1 || !Number.isInteger(item.dropSet.afterSet) || item.dropSet.afterSet !== item.sets
      || !Number.isFinite(item.dropSet.reductionPercent) || item.dropSet.reductionPercent < 5 || item.dropSet.reductionPercent > 50
      || typeof item.dropSet.instruction !== 'string')) return null;
  return structuredClone(metadata.prescription);
}

export function historyFromGymTrack(data: DataSet): WorkoutHistory[] {
  const workouts = new Map(data.workouts.filter(row => row.status === 'completed').map(row => [row.id, row]));
  const result: WorkoutHistory[] = [];
  for (const exercise of data.workoutExercises) {
    const snapshot = getWorkoutPrescription(exercise);
    const workout = workouts.get(exercise.workoutId), coreId = snapshot?.exerciseId ?? nativeToCore(data.exercises.find(row => row.id === exercise.exerciseId));
    if (!workout || !coreId || exercise.substitutedFrom) continue;
    const core = CATALOG.find(row => row.id === coreId)!;
    const rows = data.sets.filter(row => row.workoutExerciseId === exercise.id).sort((a, b) => a.number - b.number);
    const work = rows.filter(row => row.kind !== 'warmup');
    if (!work.length) continue;
    // A legacy dumbbell value could mean one dumbbell or both. Do not guess the convention.
    const knownUnit = core.loadType !== 'per-dumbbell' || !!snapshot || exercise.loadUnit === 'kg per manubrio';
    // A seat/grip alone cannot identify a physical machine. Keep actual results and
    // reference loads, but omit the *verified comparison context* required by the
    // core's successful() rule until a machine name/id is explicitly recorded.
    const verifiedEquipmentContext = !['machine', 'cable'].includes(core.equipment) || !!exercise.machineSetup?.machine?.trim();
    const sets = rows.filter(row => row.completed).flatMap(row => {
      const actual = actualSetFromNative(row, knownUnit);
      if (exercise.rirMin !== undefined && Number.isFinite(exercise.rirMin)) actual.targetRir = exercise.rirMin;
      return row.drop && row.completed ? [actual, { ...actual, reps: row.drop.reps, loadKg: knownUnit ? row.drop.weight : null, rir: null, kind: 'drop' as const, technique: 'unknown' as const }] : [actual];
    });
    result.push({ id: `${workout.id}:${exercise.id}`, date: workout.date, exerciseId: coreId,
      equipmentKey: equipmentIdentity(exercise.exerciseId, exercise.machineSetup),
      completed: work.every(row => row.completed) && (!snapshot || work.length === snapshot.sets),
      prescribedSets: snapshot?.sets ?? work.length,
      repsMin: verifiedEquipmentContext ? exercise.repsMin : undefined,
      repsMax: verifiedEquipmentContext ? exercise.repsMax : undefined, sets });
  }
  return result.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

export function bindProfileToGymTrack(profile: Profile, data: DataSet): Profile {
  const result = structuredClone(profile);
  result.loadSettings ??= {};
  for (const exercise of CATALOG) {
    const native = coreToNative(data, exercise.id);
    if (!native) continue;
    const preference = data.exercisePreferences.find(row => row.id === native.id);
    const setting = result.loadSettings[exercise.id];
    result.loadSettings[exercise.id] = {
      // Bodyweight exercises do not progress in kg; a positive placeholder only keeps profile validation uniform.
      incrementKg: preference?.weightStep ?? setting?.incrementKg ?? Math.max(1, exercise.defaultIncrementKg),
      minKg: setting?.minKg ?? exercise.defaultMinKg,
      ...(setting?.availableLoadsKg ? { availableLoadsKg: [...setting.availableLoadsKg] } : {}),
      equipmentKey: equipmentIdentity(native.id, preference?.machineSetup),
    };
  }
  return result;
}

export function profileFromSavedPlan(data: DataSet): Profile | null {
  for (const plan of [...data.plans].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    const metadata = readCoachMetadata<PlanMetadata>(plan.description);
    const profile = metadata?.profile;
    if (metadata?.schema === 1 && profile && ['hypertrophy', 'strength', 'endurance'].includes(profile.goal)
      && ['beginner', 'intermediate', 'advanced'].includes(profile.experience) && Array.isArray(profile.equipment)
      && Array.isArray(profile.priorities) && Array.isArray(profile.excludedExerciseIds)
      && Number.isInteger(profile.daysPerWeek) && Number.isFinite(profile.minutesPerSession)) return bindProfileToGymTrack(profile, data);
  }
  return null;
}

const MUSCLE_GROUPS: Record<string, string> = { chest: 'Petto', back: 'Schiena', quads: 'Quadricipiti', hamstrings: 'Femorali', glutes: 'Glutei', shoulders: 'Spalle', biceps: 'Bicipiti', triceps: 'Tricipiti', calves: 'Polpacci', core: 'Core' };
const EQUIPMENT_LABELS = { machine: 'Macchina', cable: 'Cavi', dumbbell: 'Manubri', barbell: 'Bilanciere', bodyweight: 'Corpo libero' };

/** Mutates ONLY the unpublished clone supplied by Store.change; never Store.data(). */
export function insertCoachPlan(data: DataSet, plan: TrainingPlan): string {
  if (!plan || !Array.isArray(plan.sessions) || !plan.sessions.length || !plan.id || !/^\d{4}-\d{2}-\d{2}/.test(plan.createdAt)) throw Error('Piano del coach non valido.');
  const planId = `coach-${plan.id}`;
  if (data.plans.some(row => row.id === planId)) return planId;
  const totalExercises = plan.sessions.reduce((sum, row) => sum + row.exercises.length, 0);
  if (plan.sessions.length > 6 || totalExercises > 100) throw Error('Il piano supera i limiti di importazione.');
  const groupId = (muscle: string) => {
    const name = MUSCLE_GROUPS[muscle];
    if (!name) throw Error('Gruppo muscolare del coach non riconosciuto.');
    const existing = data.muscleGroups.find(row => normalize(row.name) === normalize(name));
    if (existing) return existing.id;
    const id = `coach-muscle-${muscle}`;
    if (data.muscleGroups.some(row => row.id === id)) throw Error('Identificativo del gruppo già utilizzato.');
    data.muscleGroups.push({ id, name }); return id;
  };
  const planMetadata: PlanMetadata = { schema: 1, version: plan.version, corePlanId: plan.id, profile: structuredClone(plan.profile) };
  const description = `Programma Coach · ${plan.blockWeeks} settimane. Regole ${plan.version}. Le prescrizioni sono modificabili; gli aumenti restano suggerimenti.\n${plan.warnings.join('\n')}${encodeMetadata(planMetadata)}`;
  if (description.length > 10000) throw Error('Descrizione del piano troppo lunga.');
  data.plans.push({ id: planId, userId: data.profiles[0]?.id ?? 'local', name: `Coach · ${plan.profile.daysPerWeek} giorni`, description,
    createdAt: plan.createdAt, updatedAt: plan.createdAt,
    active: !data.plans.some(row => row.active && !row.archived && !row.completedAt), archived: false });
  for (const [dayOrder, session] of plan.sessions.entries()) {
    const dayId = `${planId}-day-${dayOrder}`;
    if (data.days.some(row => row.id === dayId)) throw Error('Identificativo giornata già utilizzato.');
    data.days.push({ id: dayId, planId, name: session.name, order: dayOrder,
      phase: 'Coach · blocco iniziale', notes: `${session.focus}\nDurata stimata: ${session.estimatedMinutes} minuti.\n${session.warnings.join('\n')}` });
    const coreGroups = [...new Set(session.exercises.flatMap(item => item.supersetGroup ? [item.supersetGroup] : []))];
    if (coreGroups.length > 4 || coreGroups.some(group => session.exercises.filter(item => item.supersetGroup === group).length !== 2)) throw Error('Le superserie devono contenere due esercizi per gruppo, al massimo quattro gruppi per seduta.');
    const supersetLabels = new Map(coreGroups.map((group, index) => [group, ['A', 'B', 'C', 'D'][index]]));
    for (const [order, prescription] of session.exercises.entries()) {
      const core = CATALOG.find(row => row.id === prescription.exerciseId);
      if (!core || !Number.isInteger(prescription.sets) || prescription.sets < 1 || prescription.sets > 30 || !Number.isInteger(prescription.repsMin) || prescription.repsMin < 1 || !Number.isInteger(prescription.repsMax) || prescription.repsMax < prescription.repsMin || prescription.repsMax > 999 || !Number.isFinite(prescription.rir) || prescription.rir < 0 || prescription.rir > 10 || !Number.isFinite(prescription.restSeconds) || prescription.restSeconds < 0 || prescription.restSeconds > 7200 || prescription.loadKg !== null && (!Number.isFinite(prescription.loadKg) || prescription.loadKg < 0)) throw Error('Prescrizione del coach non valida.');
      let native = coreToNative(data, core.id);
      if (!native) {
        const id = `coach-exercise-${core.id}`;
        if (data.exercises.some(row => row.id === id)) throw Error('Identificativo esercizio già utilizzato: verifica il catalogo.');
        native = { id, name: core.name, muscleGroupId: groupId(core.primary[0]), secondaryMuscleIds: core.secondary.map(groupId),
          description: core.cues.join(' '), equipment: EQUIPMENT_LABELS[core.equipment], tags: [`gt-coach:${core.id}`], active: true,
          createdAt: plan.createdAt, loadMode: core.loadType === 'bodyweight' ? 'bodyweight' : 'external' };
        data.exercises.push(native);
      }
      const reference = encodeMetadata({ schema: 1, version: plan.version, prescription } satisfies PrescriptionMetadata);
      const notes = [prescription.calibration ? 'Carico da calibrare: lo zero eventualmente mostrato nel registro non è una raccomandazione di carico.' : '',
        ...prescription.decisions.map(row => row.message), prescription.dropSet?.instruction ?? '',
        prescription.failureAllowedLastSet ? 'Cedimento tecnico opzionale solo nell’ultima serie, rispettando il contesto previsto.' : '',
        'Gli aumenti suggeriti richiedono un tuo riscontro sulla tecnica; applicali manualmente.'].filter(Boolean).join('\n');
      if (notes.length > 10000) throw Error('Note della prescrizione troppo lunghe.');
      data.planExercises.push({ id: `${dayId}-exercise-${order}`, dayId, exerciseId: native.id, order,
        sets: prescription.sets, repsMin: prescription.repsMin, repsMax: prescription.repsMax,
        ...(prescription.loadKg === null ? {} : { targetWeight: prescription.loadKg }),
        rest: prescription.restSeconds, rirMin: prescription.rir, rirMax: prescription.rir,
        // Do not prefill an actual RPE from the intended RIR: it would fabricate reported effort.
        loadUnit: core.loadType === 'per-dumbbell' ? 'kg per manubrio' : core.loadType === 'bodyweight' ? 'corpo libero' : 'kg',
        ...(prescription.supersetGroup ? { superset: supersetLabels.get(prescription.supersetGroup)! } : {}), reference, notes });
    }
  }
  return planId;
}

export const initialGymTrackProfile = (data: DataSet) => bindProfileToGymTrack(structuredClone(DEFAULT_PROFILE), data);
