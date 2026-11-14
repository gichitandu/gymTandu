import type { Equipment, Exercise, LoadType, Movement, Muscle } from './models.js';

function exercise(id: string, name: string, equipment: Equipment, movement: Movement, primary: Muscle[], secondary: Muscle[], isolation = false, stable = false, loadType?: LoadType, beginnerSuitable = true): Exercise {
  const type = loadType ?? (equipment === 'dumbbell' ? 'per-dumbbell' : equipment === 'machine' || equipment === 'cable' ? 'stack' : equipment === 'bodyweight' ? 'bodyweight' : 'total');
  return { id, name, equipment, movement, primary, secondary, isolation, stable, loadType: type,
    defaultIncrementKg: type === 'per-dumbbell' ? 1 : type === 'stack' ? 2.5 : type === 'bodyweight' ? 0 : 2.5,
    defaultMinKg: type === 'per-dumbbell' ? 1 : type === 'stack' ? 2.5 : type === 'bodyweight' ? 0 : 20,
    beginnerSuitable,
    cues: ['Esegui un movimento controllato nel tuo arco confortevole.', 'Interrompi la serie quando la tecnica cambia o compare dolore.'],
  };
}

/** Small curated metadata catalogue. Exclusions/preferences always override rankings. */
export const CATALOG: readonly Exercise[] = [
  exercise('machine-chest-press', 'Chest press', 'machine', 'push', ['chest'], ['triceps', 'shoulders'], false, true),
  exercise('machine-row', 'Rematore alla macchina', 'machine', 'pull', ['back'], ['biceps'], false, true),
  exercise('machine-lat-pulldown', 'Lat machine', 'machine', 'vertical-pull', ['back'], ['biceps'], false, true),
  exercise('machine-leg-press', 'Leg press', 'machine', 'squat', ['quads', 'glutes'], [], false, true),
  exercise('machine-leg-extension', 'Leg extension', 'machine', 'isolation', ['quads'], [], true, true),
  exercise('machine-leg-curl', 'Leg curl seduto', 'machine', 'hinge', ['hamstrings'], [], true, true),
  exercise('machine-shoulder-press', 'Shoulder press', 'machine', 'vertical-push', ['shoulders'], ['triceps'], false, true),
  exercise('machine-pec-deck', 'Pec deck', 'machine', 'isolation', ['chest'], [], true, true),
  exercise('machine-calf-raise', 'Calf raise alla macchina', 'machine', 'isolation', ['calves'], [], true, true),
  exercise('machine-hip-thrust', 'Hip thrust alla macchina', 'machine', 'hinge', ['glutes'], ['hamstrings'], false, true),
  exercise('cable-row', 'Pulley basso', 'cable', 'pull', ['back'], ['biceps'], false, true),
  exercise('cable-pulldown', 'Lat pulldown al cavo', 'cable', 'vertical-pull', ['back'], ['biceps'], false, true),
  exercise('cable-pushdown', 'Pushdown tricipiti', 'cable', 'isolation', ['triceps'], [], true, true),
  exercise('cable-curl', 'Curl al cavo', 'cable', 'isolation', ['biceps'], [], true, true),
  exercise('cable-lateral-raise', 'Alzate laterali al cavo', 'cable', 'isolation', ['shoulders'], [], true, true),
  exercise('cable-fly', 'Croci ai cavi', 'cable', 'isolation', ['chest'], [], true, true),
  exercise('cable-crunch', 'Crunch al cavo', 'cable', 'core', ['core'], [], true, true),
  exercise('dumbbell-bench-press', 'Distensioni con manubri', 'dumbbell', 'push', ['chest'], ['shoulders', 'triceps']),
  exercise('dumbbell-row', 'Rematore con manubrio', 'dumbbell', 'pull', ['back'], ['biceps']),
  exercise('dumbbell-shoulder-press', 'Lento con manubri', 'dumbbell', 'vertical-push', ['shoulders'], ['triceps']),
  exercise('dumbbell-goblet-squat', 'Goblet squat', 'dumbbell', 'squat', ['quads', 'glutes'], [], false, false, 'total'),
  exercise('dumbbell-rdl', 'Stacco rumeno con manubri', 'dumbbell', 'hinge', ['hamstrings', 'glutes'], [], false, false),
  exercise('dumbbell-curl', 'Curl con manubri', 'dumbbell', 'isolation', ['biceps'], [], true),
  exercise('dumbbell-lateral-raise', 'Alzate laterali con manubri', 'dumbbell', 'isolation', ['shoulders'], [], true),
  exercise('dumbbell-reverse-lunge', 'Affondi indietro con manubri', 'dumbbell', 'squat', ['quads', 'glutes'], [], false),
  exercise('dumbbell-calf-raise', 'Calf raise con manubrio', 'dumbbell', 'isolation', ['calves'], [], true, true, 'total'),
  exercise('barbell-squat', 'Squat con bilanciere', 'barbell', 'squat', ['quads', 'glutes'], [], false, false, 'total', false),
  exercise('barbell-bench-press', 'Panca piana con bilanciere', 'barbell', 'push', ['chest'], ['triceps', 'shoulders'], false, false, 'total', false),
  exercise('barbell-rdl', 'Stacco rumeno con bilanciere', 'barbell', 'hinge', ['hamstrings', 'glutes'], [], false, false, 'total', false),
  exercise('barbell-row', 'Rematore con bilanciere', 'barbell', 'pull', ['back'], ['biceps'], false, false, 'total', false),
  exercise('barbell-overhead-press', 'Military press', 'barbell', 'vertical-push', ['shoulders'], ['triceps'], false, false, 'total', false),
  exercise('bodyweight-squat', 'Squat a corpo libero', 'bodyweight', 'squat', ['quads', 'glutes'], [], false, true),
  exercise('bodyweight-pushup', 'Piegamenti', 'bodyweight', 'push', ['chest'], ['triceps', 'shoulders']),
  exercise('bodyweight-glute-bridge', 'Ponte glutei', 'bodyweight', 'hinge', ['glutes'], ['hamstrings'], false, true),
  exercise('bodyweight-calf-raise', 'Calf raise a corpo libero', 'bodyweight', 'isolation', ['calves'], [], true, true),
  exercise('bodyweight-dead-bug', 'Dead bug', 'bodyweight', 'core', ['core'], [], true, true),
];

export function getExercise(id: string): Exercise {
  const found = CATALOG.find((item) => item.id === id);
  if (!found) throw new Error(`Esercizio non riconosciuto: ${id}`);
  return found;
}
