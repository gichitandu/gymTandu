import { describe, expect, it } from 'vitest';
import {
  actualSetFromNative, annotateSetNotes, bindProfileToGymTrack, equipmentIdentity,
  historyFromGymTrack, insertCoachPlan, nativeToCore, profileFromSavedPlan,
  coachVisibleText, replaceVisibleSetNotes, getWorkoutPrescription,
} from '../src/app/services/coach-expert-adapter';
import { DEFAULT_PROFILE, generatePlan, recommendExercise } from '../src/app/coach/index';
import type { ExercisePrescription } from '../src/app/coach/models';

type NativeData = Parameters<typeof historyFromGymTrack>[0];
type NativeSet = Parameters<typeof actualSetFromNative>[0];
const empty = (): NativeData => ({
  wellnessLogs: [], exercisePreferences: [], workoutUi: [], profiles: [], roles: [],
  plans: [], days: [], planExercises: [], exercises: [], muscleGroups: [], workouts: [],
  workoutExercises: [], sets: [], settings: [], meals: [], scheduledWorkouts: [], measurements: [],
});
const nativeSet = (patch: Partial<NativeSet> = {}): NativeSet => ({
  id: 's1', workoutExerciseId: 'we1', number: 1, weight: 40, reps: 12, completed: true, ...patch,
});
const archive = (): NativeData => {
  const data = empty();
  data.profiles.push({ id: 'profile-A', name: 'Test', role: 'User' });
  data.exercises.push({ id: 'exercise-3', name: 'Chest press', equipment: 'Macchina', active: true,
    description: '', loadMode: 'external', tags: [], muscleGroupId: 'chest', secondaryMuscleIds: [], createdAt: '2026-10-01' });
  data.workouts.push({ id: 'w1', userId: 'profile-A', planId: 'existing-plan', dayId: 'existing-day',
    planName: 'Piano esistente', dayName: 'A', date: '2026-11-10', startedAt: '2026-11-10T10:00:00Z',
    endedAt: '2026-11-10T11:00:00Z', duration: 60, notes: '', status: 'completed' });
  data.workoutExercises.push({ id: 'we1', workoutId: 'w1', exerciseId: 'exercise-3', name: 'Chest press',
    loadMode: 'external', order: 0, rest: 120, notes: '', repsMin: 8, repsMax: 12,
    machineSetup: { machine: 'Gym A - chest press', seat: '3' } });
  data.sets.push(nativeSet(), nativeSet({ id: 's2', number: 2 }), nativeSet({ id: 's3', number: 3 }));
  return data;
};

describe('adattatore GymTrack: lettura conservativa', () => {
  it('gestisce un archivio vuoto e non lo muta', () => {
    const data = empty(); const snapshot = structuredClone(data);
    expect(historyFromGymTrack(data)).toEqual([]);
    expect(data).toEqual(snapshot);
  });

  it('conserva RIR e tecnica sconosciuti nello storico esistente', () => {
    const data = archive(); const before = structuredClone(data);
    const history = historyFromGymTrack(data);
    expect(history).toHaveLength(1);
    expect(history[0].sets.every(s => s.rir === null && s.technique === 'unknown')).toBe(true);
    expect(data).toEqual(before);
  });

  it('non considera completa una seduta con serie lasciate aperte', () => {
    const data = archive(); data.sets[2].completed = false;
    const history = historyFromGymTrack(data);
    expect(history).toHaveLength(1);
    expect(history[0].completed).toBe(false);
    expect(history[0].sets).toHaveLength(2);
    expect(history[0].prescribedSets).toBe(3);
  });

  it('esclude sedute ancora in bozza e sostituzioni prive di corrispondenza affidabile', () => {
    const draft = archive(); draft.workouts[0].status = 'draft';
    expect(historyFromGymTrack(draft)).toEqual([]);
    const replaced = archive(); replaced.workoutExercises[0].substitutedFrom = { exerciseId: 'other', name: 'Altro esercizio' };
    expect(historyFromGymTrack(replaced)).toEqual([]);
  });

  it('separa due regolazioni e due macchine dello stesso esercizio', () => {
    expect(equipmentIdentity('exercise-3', { machine: 'A', seat: '3' })).not.toBe(equipmentIdentity('exercise-3', { machine: 'B', seat: '3' }));
    expect(equipmentIdentity('exercise-3', { machine: 'A', seat: '3' })).not.toBe(equipmentIdentity('exercise-3', { machine: 'A', seat: '4' }));
  });

  it('non abbina esercizi solo perché il nome è simile', () => {
    const data = archive(); const renamed = { ...data.exercises[0], name: 'Chest press inclinata' };
    expect(nativeToCore(renamed)).toBeNull();
    expect(nativeToCore(data.exercises[0])).toBe('machine-chest-press');
  });

  it('traduce soltanto RPE validi e dà precedenza al RIR esplicito', () => {
    expect(actualSetFromNative(nativeSet()).rir).toBeNull();
    expect(actualSetFromNative(nativeSet({ rpe: 8 })).rir).toBe(2);
    expect(actualSetFromNative(nativeSet({ rpe: 11 })).rir).toBeNull();
    const notes = annotateSetNotes('Nota personale', { technique: 'good', pain: false, rir: 3 });
    expect(actualSetFromNative(nativeSet({ rpe: 9, notes })).rir).toBe(3);
  });

  it('mantiene null una dichiarazione esplicita di RIR sconosciuto', () => {
    const notes = annotateSetNotes('', { technique: 'unknown', pain: false, rir: null });
    expect(actualSetFromNative(nativeSet({ rpe: 8, notes })).rir).toBeNull();
  });

  it('conserva le note utente quando aggiorna il feedback', () => {
    const once = annotateSetNotes('Presa stretta', { technique: 'good', pain: false, rir: 2 });
    const twice = annotateSetNotes(once, { technique: 'degraded', pain: true, rir: 0 });
    expect(twice.startsWith('Presa stretta')).toBe(true);
    expect(twice.match(/\[GT_COACH_FEEDBACK_V1\]/g)).toHaveLength(1);
    expect(actualSetFromNative(nativeSet({ notes: twice }))).toMatchObject({ technique: 'degraded', pain: true, rir: 0 });
  });

  it('nasconde i metadati nella vista delle note mantenendoli durante una modifica', () => {
    const source = annotateSetNotes('Nota originale', { technique: 'good', pain: false, rir: 2 });
    expect(coachVisibleText(source)).toBe('Nota originale');
    const edited = replaceVisibleSetNotes(source, 'Presa più comoda');
    expect(coachVisibleText(edited)).toBe('Presa più comoda');
    expect(actualSetFromNative(nativeSet({ notes: edited }))).toMatchObject({ rir: 2, technique: 'good', pain: false });
  });

  it('rifiuta prescrizioni importate con campi numerici non validi', () => {
    const data = empty();
    insertCoachPlan(data, generatePlan(structuredClone(DEFAULT_PROFILE), [], '2026-11-13'));
    const planned = data.planExercises[0];
    const exercise = { ...archive().workoutExercises[0], reference: planned.reference };
    expect(getWorkoutPrescription(exercise)).not.toBeNull();
    const bad = exercise.reference!.replace(/"repsMin":\d+/, '"repsMin":-1');
    expect(getWorkoutPrescription({ ...exercise, reference: bad })).toBeNull();
    expect(getWorkoutPrescription({ ...exercise, reference: '\n[GT_COACH_V1]\n{}\n[/GT_COACH_V1]' })).toBeNull();
  });

  it('separa la dropset aggiuntiva dalle serie allenanti', () => {
    const data = archive(); data.sets[2].drop = { weight: 30, reps: 8 };
    const history = historyFromGymTrack(data)[0];
    expect(history.sets.filter(s => s.kind === 'working')).toHaveLength(3);
    expect(history.sets.filter(s => s.kind === 'drop')).toHaveLength(1);
    expect(history.sets.at(-1)).toMatchObject({ loadKg: 30, reps: 8, rir: null });
  });

  it('non presume la convenzione dei carichi per manubrio nei dati legacy', () => {
    const data = archive();
    data.exercises[0] = { ...data.exercises[0], id: 'exercise-17', name: 'Curl manubri', equipment: 'Manubri' };
    data.workoutExercises[0].exerciseId = 'exercise-17';
    expect(historyFromGymTrack(data)[0].sets.every(s => s.loadKg === null)).toBe(true);
    data.workoutExercises[0].loadUnit = 'kg per manubrio';
    expect(historyFromGymTrack(data)[0].sets.every(s => s.loadKg === 40)).toBe(true);
  });

  it('collega gli incrementi e la configurazione senza modificare il profilo di input', () => {
    const data = archive();
    data.exercisePreferences.push({ id: 'exercise-3', favorite: true, weightStep: 5, machineSetup: { machine: 'A', seat: '2' } });
    const p = structuredClone(DEFAULT_PROFILE), before = structuredClone(p);
    const bound = bindProfileToGymTrack(p, data);
    expect(p).toEqual(before);
    expect(bound.loadSettings?.['machine-chest-press']).toMatchObject({ incrementKg: 5, equipmentKey: equipmentIdentity('exercise-3', { machine: 'A', seat: '2' }) });
  });

  it.each([
    { label: 'macchina non identificata', machineName: '', expected: 40 },
    { label: 'macchina fisica identificata', machineName: 'Gym A - chest press', expected: 42.5 },
  ])('richiede identità fisica per aumentare: $label', ({ machineName, expected }) => {
    const data = archive();
    data.workoutExercises[0].machineSetup = { machine: machineName, seat: '3' };
    data.sets = data.sets.map(row => ({ ...row, notes: annotateSetNotes('', { technique: 'good', pain: false, rir: 2 }) }));
    data.workouts.push({ ...structuredClone(data.workouts[0]), id: 'w2', date: '2026-11-06', startedAt: '2026-11-06T10:00:00Z', endedAt: '2026-11-06T11:00:00Z' });
    data.workoutExercises.push({ ...structuredClone(data.workoutExercises[0]), id: 'we2', workoutId: 'w2' });
    data.sets.push(...data.sets.map(row => ({ ...structuredClone(row), id: `older-${row.id}`, workoutExerciseId: 'we2' })));
    const rx: ExercisePrescription = {
      exerciseId: 'machine-chest-press', name: 'Chest press', equipmentKey: equipmentIdentity('exercise-3', { machine: machineName, seat: '3' }),
      sets: 3, repsMin: 8, repsMax: 12, rir: 2, restSeconds: 120, loadKg: 40,
      loadLabel: '40 kg', loadType: 'stack', calibration: false, confidence: 'limited',
      progression: 'maintain', decisions: [], alternatives: [], failureAllowedLastSet: false,
    };
    const history = historyFromGymTrack(data);
    expect(history).toHaveLength(2);
    expect(history.every(h => h.sets.every(set => set.rir === 2 && set.technique === 'good'))).toBe(true);
    const result = recommendExercise({ profile: structuredClone(DEFAULT_PROFILE), prescription: rx, history, asOf: '2026-11-13' });
    expect(result.loadKg).toBe(expected);
    expect(result.progression).toBe(expected > 40 ? 'increase' : 'maintain');
  });

  it.each([
    { nativeId: 'exercise-0', name: 'Panca piana', equipment: 'Bilanciere', coreId: 'barbell-bench-press', loadType: 'total' as const, expected: 42.5, loadUnit: 'kg' },
    { nativeId: 'exercise-17', name: 'Curl manubri', equipment: 'Manubri', coreId: 'dumbbell-curl', loadType: 'per-dumbbell' as const, expected: 41, loadUnit: 'kg per manubrio' },
  ])('la verifica della macchina non blocca $equipment con convenzione chiara', ({ nativeId, name, equipment, coreId, loadType, expected, loadUnit }) => {
    const data = archive();
    data.exercises[0] = { ...data.exercises[0], id: nativeId, name, equipment };
    data.workoutExercises[0] = { ...data.workoutExercises[0], exerciseId: nativeId, name, machineSetup: undefined, loadUnit };
    data.sets = data.sets.map(row => ({ ...row, notes: annotateSetNotes('', { technique: 'good', pain: false, rir: 2 }) }));
    data.workouts.push({ ...structuredClone(data.workouts[0]), id: 'w2', date: '2026-11-06', startedAt: '2026-11-06T10:00:00Z', endedAt: '2026-11-06T11:00:00Z' });
    data.workoutExercises.push({ ...structuredClone(data.workoutExercises[0]), id: 'we2', workoutId: 'w2' });
    data.sets.push(...data.sets.map(row => ({ ...structuredClone(row), id: `older-${row.id}`, workoutExerciseId: 'we2' })));
    const rx: ExercisePrescription = {
      exerciseId: coreId, name, equipmentKey: equipmentIdentity(nativeId),
      sets: 3, repsMin: 8, repsMax: 12, rir: 2, restSeconds: 120, loadKg: 40,
      loadLabel: '40 kg', loadType, calibration: false, confidence: 'limited',
      progression: 'maintain', decisions: [], alternatives: [], failureAllowedLastSet: false,
    };
    const result = recommendExercise({ profile: structuredClone(DEFAULT_PROFILE), prescription: rx, history: historyFromGymTrack(data), asOf: '2026-11-13' });
    expect(result.loadKg).toBe(expected);
    expect(result.progression).toBe('increase');
  });
});

describe('adattatore GymTrack: aggiunta di un piano', () => {
  it('aggiunge un piano mantenendo il piano attivo e gli snapshot storici', () => {
    const data = archive();
    data.plans.push({ id: 'existing-plan', userId: 'profile-A', name: 'Piano esistente', description: '',
      createdAt: '2026-10-01', updatedAt: '2026-10-01', active: true, archived: false });
    const originalWorkouts = structuredClone(data.workouts), originalSets = structuredClone(data.sets), originalExercises = structuredClone(data.workoutExercises);
    const profile = bindProfileToGymTrack(structuredClone(DEFAULT_PROFILE), data);
    const plan = generatePlan(profile, [], '2026-11-13');
    const savedId = insertCoachPlan(data, plan);
    expect(data.plans.find(p => p.id === 'existing-plan')?.active).toBe(true);
    expect(data.plans.find(p => p.id === savedId)?.active).toBe(false);
    expect(data.workouts).toEqual(originalWorkouts);
    expect(data.sets).toEqual(originalSets);
    expect(data.workoutExercises).toEqual(originalExercises);
    expect(data.days.filter(d => d.planId === savedId)).toHaveLength(plan.sessions.length);
    expect(data.planExercises.length).toBe(plan.sessions.reduce((n, s) => n + s.exercises.length, 0));
  });

  it('ripetere il salvataggio dello stesso piano non duplica i dati', () => {
    const data = empty(), plan = generatePlan(structuredClone(DEFAULT_PROFILE), [], '2026-11-13');
    insertCoachPlan(data, plan); const once = structuredClone(data);
    insertCoachPlan(data, plan);
    expect(data).toEqual(once);
  });

  it('non trasforma il RIR prescritto in RPE realmente dichiarato', () => {
    const data = empty(), plan = generatePlan(structuredClone(DEFAULT_PROFILE), [], '2026-11-13');
    insertCoachPlan(data, plan);
    expect(data.planExercises.every(e => e.rpe === undefined)).toBe(true);
    expect(data.planExercises.filter(e => e.targetWeight === undefined).length).toBeGreaterThan(0);
  });

  it('ripristina i parametri del profilo dal piano salvato', () => {
    const data = empty(), p = { ...structuredClone(DEFAULT_PROFILE), daysPerWeek: 2, minutesPerSession: 60 };
    insertCoachPlan(data, generatePlan(p, [], '2026-11-13'));
    expect(profileFromSavedPlan(data)).toMatchObject({ daysPerWeek: 2, minutesPerSession: 60, goal: p.goal });
  });
});
