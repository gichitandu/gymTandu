import type { Profile, Goal, Experience } from './models.js';

export const ENGINE_VERSION = '1.0.0';
export const RULESET_DATE = '2026-11-12';
export const DEFAULT_PROFILE: Profile = {
  goal: 'hypertrophy', experience: 'beginner', daysPerWeek: 3,
  minutesPerSession: 45, equipment: ['machine', 'cable', 'dumbbell', 'bodyweight'],
  priorities: [], excludedExerciseIds: [], allowSupersets: false,
  allowDropSets: false, allowFailure: false,
};

/** Implementation presets, not scientifically unique optimal prescriptions. */
export const GOAL_PRESETS: Record<Goal, { compound: [number, number]; isolation: [number, number]; restCompound: number; restIsolation: number }> = {
  hypertrophy: { compound: [8, 12], isolation: [10, 15], restCompound: 120, restIsolation: 90 },
  strength: { compound: [4, 6], isolation: [8, 12], restCompound: 180, restIsolation: 90 },
  endurance: { compound: [12, 18], isolation: [15, 20], restCompound: 90, restIsolation: 60 },
};
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
