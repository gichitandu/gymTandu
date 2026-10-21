import { DataSet, TABLES } from "../models/domain";
export function validateIntegrity(d: DataSet) {
  const fail = (m: string): never => {
    throw Error("Backup non valido: " + m);
  };
  for (const name of TABLES) {
    if (new Set(d[name].map((e) => e.id)).size !== d[name].length)
      fail("ID duplicati in " + name);
  }
  if (d.profiles[0].id !== "local" || d.settings[0].id !== "local")
    fail("profilo locale non valido");
  if (
    new Set(d.roles.map((r) => r.name)).size !== 3 ||
    !d.roles.some((r) => r.name === d.profiles[0].role)
  )
    fail("ruoli non validi");
  if (
    d.plans.filter((p) => p.active).length > 1 ||
    d.plans.some((p) => p.active && p.archived)
  )
    fail("piani attivi incoerenti");
  const exists = (t: keyof DataSet, id: string) =>
    d[t].some((e) => e.id === id);
  for (const p of d.plans)
    if (!exists("profiles", p.userId)) fail("utente del piano mancante");
  for (const e of d.exercises)
    if (
      !exists("muscleGroups", e.muscleGroupId) ||
      e.secondaryMuscleIds.some((g) => !exists("muscleGroups", g))
    )
      fail("gruppo muscolare mancante");
  for (const day of d.days)
    if (!exists("plans", day.planId)) fail("piano del giorno mancante");
  for (const e of d.planExercises)
    if (!exists("days", e.dayId) || !exists("exercises", e.exerciseId))
      fail("riferimento esercizio del piano mancante");
  // Historical plan/day/catalog references may be absent: workout snapshots are authoritative.
  for (const w of d.workouts)
    if (!exists("profiles", w.userId)) fail("utente dell’allenamento mancante");
  if (d.workouts.filter((w) => w.status === "draft").length > 1)
    fail("più sessioni in corso");
  for (const e of d.workoutExercises)
    if (!exists("workouts", e.workoutId))
      fail("allenamento dell’esercizio mancante");
  for (const s of d.sets)
    if (!exists("workoutExercises", s.workoutExerciseId))
      fail("esercizio della serie mancante");
  for(const m of d.meals) {
    if(!m.name.trim()||!/^\d{4}-\d{2}-\d{2}$/.test(m.date)||!Number.isFinite(m.grams)||m.grams<=0||m.grams>10000||[m.calories,m.protein,m.carbs,m.fat].some((v,i)=>!Number.isFinite(v)||v<0||v>[20000,2000,3000,2000][i])||m.photo && (m.photo.size>500*1024||!["image/jpeg","image/png","image/webp"].includes(m.photo.type))) fail("pasto non valido");
  }
  const photo=d.profiles[0].photo;
  if(photo && (photo.size>500*1024||!["image/jpeg","image/png","image/webp"].includes(photo.type))) fail("foto profilo non valida");
  const setKeys = d.sets.map((s) => s.workoutExerciseId + ":" + s.number);
  if (new Set(setKeys).size !== setKeys.length) fail("numeri serie duplicati");
}
