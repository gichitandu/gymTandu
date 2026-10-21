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
}
export interface TrainingPlanDay extends Entity {
  planId: string;
  name: string;
  order: number;
  weekday?: number;
}
export interface TrainingPlanExercise extends Entity {
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
  notes: string;
  status: "draft" | "completed";
  bodyWeight?: number;
}
export interface WorkoutLogExercise extends Entity {
  workoutId: string;
  exerciseId: string;
  name: string;
  loadMode: LoadMode;
  order: number;
  rest: number;
  notes: string;
}
export interface WorkoutLogSet extends Entity {
  workoutExerciseId: string;
  number: number;
  weight: number;
  reps: number;
  rpe?: number;
  rest?: number;
  notes?: string;
  completed: boolean;
}
export interface Meal extends Entity {
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
export interface ScheduledWorkout extends Entity {
  date: string; planId:string; dayId:string; planName:string; dayName:string; notes:string; workoutId?:string;
}
export interface BodyMeasurement extends Entity {date:string;weight:number;waist?:number;bodyFat?:number;}
export interface PersonalGoals {calories?:number;protein?:number;carbs?:number;fat?:number;workoutsPerWeek?:number;}
export interface AppSettings extends Entity {
  theme: "dark" | "light";
  unit: "kg" | "lb";
  prefill: boolean;
  lastBackup?: string;
  backgroundColor?: string;
  goals?: PersonalGoals;
}
export interface DataSet {
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
];
export const uid = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
export const localDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
