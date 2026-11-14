export type Goal = 'hypertrophy' | 'strength' | 'endurance';
export type Experience = 'beginner' | 'intermediate' | 'advanced';
export type Equipment = 'machine' | 'cable' | 'dumbbell' | 'barbell' | 'bodyweight';
export type Muscle = 'chest' | 'back' | 'quads' | 'hamstrings' | 'glutes' | 'shoulders' | 'biceps' | 'triceps' | 'calves' | 'core';
export type Movement = 'squat' | 'hinge' | 'push' | 'pull' | 'vertical-push' | 'vertical-pull' | 'isolation' | 'core';
export type LoadType = 'total' | 'per-dumbbell' | 'stack' | 'bodyweight';
export type Confidence = 'initial' | 'limited' | 'established';
export interface LoadSetting {
  incrementKg: number;
  minKg: number;
  /** Specific real machine/setup. Change it when moving to a different machine. */
  equipmentKey?: string;
  availableLoadsKg?: number[];
}
export interface Profile {
  goal: Goal;
  experience: Experience;
  daysPerWeek: number;
  minutesPerSession: number;
  equipment: Equipment[];
  priorities: Muscle[];
  excludedExerciseIds: string[];
  allowSupersets: boolean;
  allowDropSets: boolean;
  allowFailure: boolean;
  loadSettings?: Record<string, LoadSetting>;
}
export interface Exercise {
  id: string;
  name: string;
  equipment: Equipment;
  movement: Movement;
  primary: Muscle[];
  secondary: Muscle[];
  isolation: boolean;
  stable: boolean;
  loadType: LoadType;
  defaultIncrementKg: number;
  defaultMinKg: number;
  beginnerSuitable: boolean;
  cues: string[];
}
export interface ActualSet {
  reps: number;
  loadKg: number | null;
  rir: number | null;
  kind: 'working' | 'warmup' | 'drop';
  technique: 'good' | 'degraded' | 'unknown';
  pain: boolean;
  /** Optional programmed context; sets from incompatible prescriptions are not evidence for increases. */
  targetRir?: number;
}
export interface WorkoutHistory {
  id: string;
  date: string;
  exerciseId: string;
  equipmentKey: string;
  completed: boolean;
  sets: ActualSet[];
  /** Optional prescription context; omitted means limited confidence. */
  prescribedSets?: number;
  repsMin?: number;
  repsMax?: number;
}
export interface Decision {
  ruleId: string;
  message: string;
  kind: 'evidence-informed' | 'heuristic' | 'constraint';
  sourceIds: string[];
}
export interface DropSet {
  afterSet: number;
  reductionPercent: number;
  targetRir: number;
  maxDrops: 1;
  countsAsAdditionalWork: true;
  instruction: string;
}
export interface ExercisePrescription {
  exerciseId: string;
  name: string;
  equipmentKey: string;
  sets: number;
  repsMin: number;
  repsMax: number;
  rir: number;
  restSeconds: number;
  loadKg: number | null;
  loadLabel: string;
  loadType: LoadType;
  calibration: boolean;
  confidence: Confidence;
  progression: 'calibrate' | 'maintain' | 'increase' | 'reduce' | 'review';
  decisions: Decision[];
  alternatives: string[];
  supersetGroup?: string;
  dropSet?: DropSet;
  failureAllowedLastSet: boolean;
}
export interface PlanSession {
  id: string;
  name: string;
  focus: string;
  exercises: ExercisePrescription[];
  estimatedMinutes: number;
  warnings: string[];
}
export interface TrainingPlan {
  id: string;
  version: string;
  createdAt: string;
  profile: Profile;
  sessions: PlanSession[];
  /** Direct working sets only. Secondary exposure and drops are reported separately. */
  weeklyVolume: Record<Muscle, number>;
  secondaryExposure: Record<Muscle, number>;
  supplementalDropSets: number;
  warnings: string[];
  decisions: Decision[];
  blockWeeks: number;
}
export interface ExerciseRecommendationInput {
  profile: Profile;
  prescription: ExercisePrescription;
  history: WorkoutHistory[];
  asOf: string;
}
export interface NextSetInput {
  profile: Profile;
  prescription: ExercisePrescription;
  completedSets: ActualSet[];
}
export interface SetRecommendation {
  setNumber: number;
  loadKg: number | null;
  repsMin: number;
  repsMax: number;
  rir: number;
  restSeconds: number;
  action: 'calibrate' | 'maintain' | 'reduce' | 'rest' | 'stop' | 'complete';
  reason: string;
  ruleId: string;
  confidence: Confidence;
  isTemporary: true;
  dropSet?: DropSet;
}
export interface RecoveryAssessment {
  action: 'continue' | 'review-exercise' | 'consider-deload' | 'stop';
  reason: string;
  affectedExerciseIds: string[];
  suggestedVolumeFactor: number;
  automatic: false;
  decisions: Decision[];
}
