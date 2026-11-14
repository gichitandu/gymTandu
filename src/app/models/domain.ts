export type RoleName = "SuperAdmin" | "Admin" | "User";
export type LoadMode =
  "external" | "bodyweight" | "weighted-bodyweight" | "assisted";
export interface Entity {
  id: string;
}
export interface Role extends Entity {
  name: RoleName;
  permissions: string[];
}
export interface UserProfile extends Entity {
  name: string;
  photo?: Blob;
  role: RoleName;
  bodyWeight?: number;
  height?: number;
  birthDate?: string;
  goal?: string;
}
export interface TrainingPlan extends Entity {
  userId: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  active: boolean;
  archived: boolean;
  program?: ExcelProgramMetadata;
  completedAt?: string;
  completionReason?: 'automatic' | 'manual';
}
export interface ExcelProgramMetadata {
  importId: string;
  sourceName: string;
  sourceKind: 'original' | 'GT-1';
  startDate: string;
  endDate: string;
  weeks: number;
  fileHash: string;
  importedAt: string;
  sessionCount: number;
  createdExerciseIds?: string[];
  createdGroupIds?: string[];
}
export interface ExercisePrescriptionDetails {
  rirMin?: number;
  rirMax?: number;
  warmupNotes?: string;
  reference?: string;
  loadUnit?: string;
}
export interface TrainingPlanDay extends Entity {
  planId: string;
  name: string;
  order: number;
  weekday?: number;
  week?: number;
  sessionDate?: string;
  phase?: string;
  notes?: string;
}
export interface TrainingPlanExercise extends Entity, ExercisePrescriptionDetails {
  superset?: string;
  warmupSets?: number;
  dayId: string;
  exerciseId: string;
  sets: number;
  repsMin: number;
  repsMax: number;
  targetWeight?: number;
  rest: number;
  rpe?: number;
  notes: string;
  order: number;
}
export interface MuscleGroup extends Entity {
  name: string;
}
export interface Exercise extends Entity {
  name: string;
  muscleGroupId: string;
  secondaryMuscleIds: string[];
  description: string;
  image?: Blob;
  videoUrl?: string;
  thumbnailUrl?: string;
  videoTitle?: string;
  videoChannel?: string;
  equipment: string;
  tags: string[];
  active: boolean;
  createdAt: string;
  loadMode: LoadMode;
}
export interface WorkoutLog extends Entity {
  userId: string;
  planId: string;
  dayId: string;
  planName: string;
  dayName: string;
  date: string;
  startedAt: string;
  endedAt?: string;
  duration: number;
  durationUnknown?:boolean;
  notes: string;
  status: "draft" | "completed";
  bodyWeight?: number;
  programWeek?: number;
  programPhase?: string;
}
export interface WorkoutLogExercise extends Entity, ExercisePrescriptionDetails {
  substitutedFrom?: {exerciseId:string;name:string};
  superset?: string;
  machineSetup?: MachineSetup;
  workoutId: string;
  exerciseId: string;
  name: string;
  loadMode: LoadMode;
  order: number;
  rest: number;
  notes: string;
  repsMin?: number;
  repsMax?: number;
}
export interface WorkoutLogSet extends Entity {
  kind?: "work" | "warmup";
  workoutExerciseId: string;
  number: number;
  weight: number;
  reps: number;
  rpe?: number;
  rest?: number;
  notes?: string;
  completed: boolean;
  /** Serie a scalare: subito dopo questa serie, meno carico per altre ripetizioni. */
  drop?: {weight:number;reps:number};
}
export interface MealIngredient {id:string;name:string;grams:number;calories:number;protein:number;carbs:number;fat:number;}
export interface Meal extends Entity {
  ingredients?: MealIngredient[];
  mealType?: "breakfast"|"lunch"|"dinner"|"snack";
  date: string;
  name: string;
  grams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  notes: string;
  photo?: Blob;
  source: "manual" | "photo-suggestion";
  createdAt: string;
}
export type CalendarEventKind = 'workout' | 'cardio' | 'mobility' | 'rest' | 'other';
export interface CalendarEventOptions {time?:string;durationMinutes?:number;estimatedCalories?:number;}
export interface CalendarActivityInput extends CalendarEventOptions {id?:string;date:string;kind:Exclude<CalendarEventKind,'workout'>;title:string;notes?:string;done?:boolean;}
export interface ScheduledWorkout extends Entity, CalendarEventOptions {
  date: string; planId:string; dayId:string; planName:string; dayName:string; notes:string; workoutId?:string;
  kind?:CalendarEventKind;
  done?:boolean;
}
export interface BodyMeasurement extends Entity {date:string;weight:number;waist?:number;bodyFat?:number;}
export interface PersonalGoals {calories?:number;protein?:number;carbs?:number;fat?:number;workoutsPerWeek?:number;}
export interface MachineSetup {machine?:string;seat?:string;backrest?:string;grip?:string;notes?:string;}
export interface ExercisePreference extends Entity {favorite:boolean;machineSetup?:MachineSetup;weightStep?:number;}
export interface WorkoutUiState extends Entity {step:'list'|'detail'|'record'|'rest';tab:'sets'|'history'|'notes';exerciseId:string;setId:string;restEnd:number;restTotal:number;paused:boolean;pausedSeconds:number;weight:number;reps:number;rpe?:number;setNotes:string;kind:'work'|'warmup';updatedAt:string;}
export interface IphoneCheck {state:'todo'|'pass'|'fail';note?:string;checkedAt?:string;}
export interface IphoneChecklist {device:string;ios:string;checks:Record<string,IphoneCheck>;}
export interface CatalogBaseline { exercises: Record<string, string>; groups: Record<string, string> }
export interface AppSettings extends Entity {
  neonGlow?:number;dynamicBackground?:boolean;
  allowCompletedWorkoutDeletion?:boolean;
  gymMode?:boolean;
  archiveResetId?: string;
  catalogBaseline?: CatalogBaseline;
  /** Legacy notification preference, retained only for archive compatibility. */
  externalTimerEnabled?: boolean;
  backupConfirmedAt?:string;
  backupReminderDays?:number;
  backupSnoozedUntil?:string;
  iphoneChecklist?:IphoneChecklist;
  theme: "dark" | "light";
  unit: "kg" | "lb";
  prefill: boolean;
  reusePreviousWeek?: boolean;
  lastBackup?: string;
  backgroundColor?: string;
  themeConfig?: {palette:string;mode:'dark'|'light'|'system';background?:string;accent?:string};
  goals?: PersonalGoals;
}
/** Daily self-reports; no physiological readiness is inferred from training. */
export interface WellnessLog extends Entity {
 date:string;sleepMinutes?:number;sleepQuality?:number;energy?:number;stress?:number;
 soreness:Record<string,number>;notes:string;
}
/** Grammi di creatina assunti in un giorno (un solo record per data). */
export interface CreatineLog extends Entity {
  date: string;
  grams: number;
}
export interface DataSet {
  wellnessLogs: WellnessLog[];
  creatineLogs: CreatineLog[];
  exercisePreferences: ExercisePreference[];
  workoutUi: WorkoutUiState[];
  profiles: UserProfile[];
  roles: Role[];
  plans: TrainingPlan[];
  days: TrainingPlanDay[];
  planExercises: TrainingPlanExercise[];
  exercises: Exercise[];
  muscleGroups: MuscleGroup[];
  workouts: WorkoutLog[];
  workoutExercises: WorkoutLogExercise[];
  sets: WorkoutLogSet[];
  settings: AppSettings[];
  meals: Meal[];
  scheduledWorkouts: ScheduledWorkout[];
  measurements: BodyMeasurement[];
}
export const TABLES: (keyof DataSet)[] = [
  "exercisePreferences",
  "workoutUi",
  "profiles",
  "roles",
  "plans",
  "days",
  "planExercises",
  "exercises",
  "muscleGroups",
  "workouts",
  "workoutExercises",
  "sets",
  "settings",
  "meals",
  "scheduledWorkouts",
  "measurements",
  "wellnessLogs",
  "creatineLogs",
];
export const uid = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
export const localDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
