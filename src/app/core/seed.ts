import { defaultExercises, defaultGroups } from "./default-catalog";
import { DataSet } from "../models/domain";
export function seed(): DataSet {
  return {
    wellnessLogs: [],creatineLogs: [],exercisePreferences: [],workoutUi: [],
    profiles: [{ id: "local", name: "Atleta", role: "SuperAdmin" }],
    roles: [
      { id: "superadmin", name: "SuperAdmin", permissions: ["*"] },
      { id: "admin", name: "Admin", permissions: ["catalog:write"] },
      {
        id: "user",
        name: "User",
        permissions: ["plans:own", "workouts:own", "stats:own"],
      },
    ],
    plans: [],
    days: [],
    planExercises: [],
    exercises: structuredClone(defaultExercises),
    muscleGroups: structuredClone(defaultGroups),
    meals: [],
    scheduledWorkouts: [],
    measurements: [],
    workouts: [],
    workoutExercises: [],
    sets: [],
    settings: [{ id: "local", theme: "dark", unit: "kg", prefill: false }],
  };
}
