import { DataSet, TrainingPlanExercise } from '../models/domain';

export type PlanReplacementScope = 'single' | 'all' | 'selected';
export interface PlanReplacementRequest {
  sourceId: string; replacementId: string; scope: PlanReplacementScope; dayIds?: readonly string[];
  expectedExerciseId: string; workoutExerciseId?: string;
}
export interface PlanReplacementResult {changed: number; days: number; activeChanged: boolean; activePreserved: boolean}

export function planReplacementTargets(data: DataSet, sourceId: string, scope: PlanReplacementScope, dayIds: readonly string[] = []): TrainingPlanExercise[] {
  const source = data.planExercises.find(row => row.id === sourceId), day = data.days.find(row => row.id === source?.dayId);
  if (!source || !day) return [];
  if (scope === 'single') return [source];
  const allowed = new Set(data.days.filter(row => row.planId === day.planId && (scope === 'all' || dayIds.includes(row.id))).map(row => row.id));
  return data.planExercises.filter(row => row.exerciseId === source.exerciseId && allowed.has(row.dayId));
}

/** Change only an unrecorded exercise snapshot, never a completed set's identity. */
export function replaceWorkoutExercise(data: DataSet, id: string, replacementId: string) {
  const row = data.workoutExercises.find(item => item.id === id), replacement = data.exercises.find(item => item.id === replacementId && item.active);
  if (!row || !data.workouts.some(workout => workout.id === row.workoutId && workout.status === 'draft')) throw Error('La seduta non è più aperta.');
  if (!replacement || replacement.id === row.exerciseId) throw Error('Scegli un altro esercizio attivo.');
  if (data.sets.some(set => set.workoutExerciseId === id && set.completed)) throw Error('Le serie già eseguite restano associate al loro esercizio. Sostituisci prima di completare una serie.');
  row.substitutedFrom ??= {exerciseId: row.exerciseId, name: row.name};
  row.exerciseId = replacement.id; row.name = replacement.name; row.loadMode = replacement.loadMode;
  row.machineSetup = structuredClone(data.exercisePreferences.find(item => item.id === replacementId)?.machineSetup);
  delete row.reference; delete row.loadUnit;
  for (const set of data.sets.filter(item => item.workoutExerciseId === id)) {set.weight = 0; delete set.rpe; set.notes = '';}
  for (const state of data.workoutUi.filter(item => item.exerciseId === id)) {state.weight = 0; delete state.rpe; state.setNotes = '';}
}

/** Runs within Store's atomic archive transaction. Historical snapshots stay intact. */
export function replacePlanExercise(data: DataSet, request: PlanReplacementRequest): PlanReplacementResult {
  const source = data.planExercises.find(row => row.id === request.sourceId), day = data.days.find(row => row.id === source?.dayId);
  const plan = data.plans.find(row => row.id === day?.planId), replacement = data.exercises.find(row => row.id === request.replacementId && row.active);
  if (!source || !day || !plan || plan.archived || plan.completedAt) throw Error('Il piano non è più modificabile.');
  if (source.exerciseId !== request.expectedExerciseId) throw Error('L’esercizio è cambiato. Riapri la sostituzione per controllare la selezione.');
  if (!replacement || replacement.id === source.exerciseId) throw Error('Scegli un altro esercizio attivo.');
  if (!['single', 'all', 'selected'].includes(request.scope)) throw Error('Ambito della sostituzione non valido.');
  if (request.scope === 'selected') {
    const selected = request.dayIds;
    if (!selected?.length || selected.length > 100000 || new Set(selected).size !== selected.length || selected.some(id => !data.days.some(row => row.id === id && row.planId === plan.id) || !data.planExercises.some(row => row.dayId === id && row.exerciseId === source.exerciseId)))
      throw Error('Seleziona gli allenamenti di questo piano che contengono l’esercizio.');
  }
  const targets = planReplacementTargets(data, source.id, request.scope, request.dayIds);
  if (!targets.length) throw Error('Nessun esercizio da sostituire nella selezione.');
  const days = new Set(targets.map(row => row.dayId));
  let activeChanged = false, activePreserved = false;
  if (request.workoutExerciseId) {
    const active = data.workoutExercises.find(row => row.id === request.workoutExerciseId);
    const workout = data.workouts.find(row => row.id === active?.workoutId && row.status === 'draft');
    if (!active || !workout || workout.planId !== plan.id || active.exerciseId !== source.exerciseId) throw Error('La seduta è cambiata. Riapri la sostituzione.');
    if (days.has(workout.dayId)) {
      if (data.sets.some(set => set.workoutExerciseId === active.id && set.completed)) activePreserved = true;
      else {replaceWorkoutExercise(data, active.id, replacement.id); activeChanged = true;}
    }
  }
  for (const row of targets) {
    row.exerciseId = replacement.id;
    // Loads and references to a different machine are not transferable.
    delete row.targetWeight; delete row.reference; delete row.loadUnit;
  }
  plan.updatedAt = new Date().toISOString();
  return {changed: targets.length, days: days.size, activeChanged, activePreserved};
}
