import { DataSet, Exercise, now } from "../models/domain";
export function seed(): DataSet {
  const groups = ["Petto", "Schiena", "Spalle", "Gambe", "Braccia", "Core"];
  const entries: [string, number, string][] = [
    ["Panca piana", 0, "Bilanciere"],
    ["Panca inclinata manubri", 0, "Manubri"],
    ["Croci ai cavi", 0, "Cavi"],
    ["Chest press", 0, "Macchina"],
    ["Lat machine", 1, "Macchina"],
    ["Rematore bilanciere", 1, "Bilanciere"],
    ["Pulley", 1, "Cavi"],
    ["Trazioni alla sbarra", 1, "Corpo libero"],
    ["Shoulder press", 2, "Manubri"],
    ["Alzate laterali", 2, "Manubri"],
    ["Alzate posteriori", 2, "Manubri"],
    ["Squat", 3, "Bilanciere"],
    ["Leg press", 3, "Macchina"],
    ["Leg extension", 3, "Macchina"],
    ["Leg curl", 3, "Macchina"],
    ["Stacco rumeno", 3, "Bilanciere"],
    ["Curl bilanciere", 4, "Bilanciere"],
    ["Curl manubri", 4, "Manubri"],
    ["Pushdown cavo", 4, "Cavi"],
    ["French press", 4, "Bilanciere"],
    ["Crunch", 5, "Corpo libero"],
  ];
  const exercises: Exercise[] = entries.map(([name, g, equipment], i) => ({
    id: `exercise-${i}`,
    name,
    muscleGroupId: `muscle-${g}`,
    secondaryMuscleIds: [],
    description: "",
    equipment,
    tags: [],
    active: true,
    createdAt: now(),
    loadMode: equipment === "Corpo libero" ? "bodyweight" : "external",
  }));
  return {
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
    exercises,
    muscleGroups: groups.map((name, i) => ({ id: `muscle-${i}`, name })),
    workouts: [],
    workoutExercises: [],
    sets: [],
    settings: [{ id: "local", theme: "dark", unit: "kg", prefill: false }],
  };
}
