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
export interface AppSettings extends Entity {
  theme: "dark" | "light";
  unit: "kg" | "lb";
  prefill: boolean;
  lastBackup?: string;
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
];
export const uid = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
export const localDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
