import type { DayFocus, Profile, Goal, Experience, SplitMode } from './models.js';

export const ENGINE_VERSION = '1.3.0';
export const RULESET_DATE = '2026-11-27';
export const DEFAULT_PROFILE: Profile = {
  goal: 'hypertrophy', experience: 'beginner', daysPerWeek: 3,
  minutesPerSession: 45, equipment: ['machine', 'cable', 'dumbbell', 'bodyweight'],
  priorities: [], excludedExerciseIds: [], allowSupersets: false,
  allowDropSets: false, allowFailure: false,
};

/** Implementation presets, not scientifically unique optimal prescriptions.
 * 1.1.0: three tiers. Heavy multi-joint lifts use the lowest range of each goal
 * (strength zone for 1RM; manageable heavy loads and stable technique for hypertrophy),
 * other multi-joint exercises a moderate range, isolation/bodyweight/core the highest. */
export type RepTier = 'heavy' | 'compound' | 'isolation';
export const GOAL_PRESETS: Record<Goal, Record<RepTier, { reps: [number, number]; rest: number }>> = {
  hypertrophy: { heavy: { reps: [6, 8], rest: 150 }, compound: { reps: [8, 10], rest: 120 }, isolation: { reps: [10, 15], rest: 90 } },
  strength: { heavy: { reps: [4, 6], rest: 180 }, compound: { reps: [6, 8], rest: 150 }, isolation: { reps: [8, 12], rest: 90 } },
  endurance: { heavy: { reps: [10, 15], rest: 90 }, compound: { reps: [12, 18], rest: 90 }, isolation: { reps: [15, 20], rest: 60 } },
};
/** Multi-joint lifts that can be loaded heavily with a stable, measurable load. Explicit, not inferred. */
export const HEAVY_COMPOUNDS: ReadonlySet<string> = new Set([
  'barbell-squat', 'barbell-bench-press', 'barbell-rdl', 'barbell-row', 'barbell-overhead-press',
  'machine-leg-press', 'machine-hip-thrust',
]);
export const EXPERIENCE_PRESETS: Record<Experience, { sets: number; rir: number }> = {
  beginner: { sets: 2, rir: 3 }, intermediate: { sets: 3, rir: 2 }, advanced: { sets: 3, rir: 2 },
};
export const HEURISTICS = {
  comparableSuccessesForIncrease: 2,
  staleHistoryDays: 28,
  plateauSessions: 3,
  maxRelativeIncrease: 0.10,
  reductionFraction: 0.05,
  dropReductionPercent: 20,
  minimumSessionMinutes: 20,
  warmupMinutes: 7,
  transitionSeconds: 60,
  secondsPerRep: 3,
} as const;

export const GOAL_LABELS = { hypertrophy: 'Crescita muscolare', strength: 'Forza', endurance: 'Resistenza muscolare' };
export const MUSCLE_LABELS = {
  chest: 'Petto', back: 'Dorso', quads: 'Quadricipiti', hamstrings: 'Femorali', glutes: 'Glutei',
  shoulders: 'Spalle', biceps: 'Bicipiti', triceps: 'Tricipiti', calves: 'Polpacci', core: 'Core',
};

/** Strutture settimanali selezionabili. 'auto' conserva la proposta storica (full body fino a 3 sedute, poi upper/lower). */
export const SPLIT_LABELS: Record<SplitMode, string> = {
  auto: 'Automatica', 'full-body': 'Full body', 'upper-lower': 'Upper / Lower',
  'push-pull-legs': 'Push / Pull / Legs', 'body-part': 'Per gruppi muscolari', custom: 'Personalizzata',
};
export const DAY_FOCUS_LABELS: Record<DayFocus, string> = {
  full: 'Full body', upper: 'Upper · parte alta', lower: 'Lower · gambe', push: 'Push · spinta', pull: 'Pull · tirata',
  'chest-back': 'Petto e dorso', 'chest-triceps': 'Petto e tricipiti', 'back-biceps': 'Dorso e bicipiti',
  'shoulders-arms': 'Spalle e braccia', 'glutes-hamstrings': 'Glutei e femorali',
};
export const SESSION_MINUTES_RANGE = { min: 20, max: 120 } as const;
export const BLOCK_WEEKS_RANGE = { min: 2, max: 16, default: 4 } as const;
export const MAX_EXERCISES_RANGE = { min: 3, max: 10, default: 8 } as const;
/** Serie in più o in meno per esercizio rispetto al preset di esperienza. */
export const VOLUME_SET_DELTA = { low: -1, standard: 0, high: 1 } as const;
/** Secondi in più o in meno sul recupero del preset; i recuperi brevi non scendono sotto 45 secondi. */
export const REST_DELTA_SECONDS = { short: -30, standard: 0, long: 30 } as const;
export const MIN_REST_SECONDS = 45;
