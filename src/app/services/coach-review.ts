/**
 * Valutazione del Coach a fine seduta: come lavorerebbe un allenatore guardando il diario.
 * Funzione pura, legge solo i dati già registrati (serie completate, sforzo, tecnica, dolore).
 *
 * Criteri (indicazioni generali, non prescrizioni mediche):
 *  - serie utili per la crescita: circa 0–3 ripetizioni in riserva (RPE 7–10); oltre 4 in
 *    riserva lo stimolo cala (Refalo 2023, Robinson 2024);
 *  - il cedimento sistematico aumenta la fatica senza dare più crescita (Refalo 2023, Vieira 2021);
 *  - volume settimanale per muscolo: circa 10–20 serie allenanti, le indirette contano metà
 *    (Schoenfeld 2017, Pelland 2024); oltre circa 10 serie dirette nella stessa seduta il
 *    beneficio aggiunto cala ed è meglio dividerle su più giorni;
 *  - calo marcato di ripetizioni tra la prima e l'ultima serie allo stesso carico: il limite è
 *    il recupero tra le serie (Schoenfeld 2016).
 */
import type { DataSet } from "../models/domain";
import { coachRestSeconds, coachSetFromLog, isCompoundExercise, secondaryMuscleGroups, weeklyMuscleSets } from "./coach-shadow";

export type CoachInsightTone = "good" | "warn" | "info";
export interface CoachInsight {
  tone: CoachInsightTone;
  title: string;
  text: string;
}
export interface CoachReviewMuscle {
  id: string;
  name: string;
  /** Serie della seduta: 1 come muscolo principale, 0,5 come muscolo coinvolto in modo indiretto. */
  session: number;
  /** Serie degli ultimi 7 giorni, seduta compresa. */
  weekly: number;
}
export interface CoachReviewExercise {
  name: string;
  sets: { weight: number; reps: number; effort?: number }[];
  loadMode: string;
  repsMin?: number;
  repsMax?: number;
}
export interface CoachReview {
  workingSets: number;
  /** Serie con RPE o ripetizioni in riserva dichiarati. */
  declared: number;
  /** Serie con 0–3 ripetizioni in riserva. */
  effective: number;
  /** Serie con 4 o più ripetizioni in riserva. */
  easy: number;
  /** Serie a cedimento (RPE 10). */
  failure: number;
  pain: number;
  degraded: number;
  muscles: CoachReviewMuscle[];
  exercises: CoachReviewExercise[];
  insights: CoachInsight[];
}

const number = (value: number) => value.toLocaleString("it-IT", { maximumFractionDigits: 1 });
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
const minutes = (seconds: number) => (seconds >= 120 ? number(seconds / 60) + " min" : seconds + " s");

/** Valutazione di un allenamento completato; null se manca o non ha serie allenanti completate. */
export function coachSessionReview(data: DataSet, workoutId: string): CoachReview | null {
  const workout = data.workouts.find((row) => row.id === workoutId && row.status === "completed");
  if (!workout) return null;
  const rows = data.workoutExercises.filter((row) => row.workoutId === workoutId).sort((a, b) => a.order - b.order);
  const groups = data.muscleGroups ?? [];
  const exercises: CoachReviewExercise[] = [];
  const painNames: string[] = [], degradedNames: string[] = [];
  const muscleSets = new Map<string, number>();
  let workingSets = 0, declared = 0, effective = 0, easy = 0, failure = 0, pain = 0, degraded = 0;
  const drops: CoachInsight[] = [];

  for (const row of rows) {
    const logged = data.sets
      .filter((set) => set.workoutExerciseId === row.id && set.completed && set.kind !== "warmup")
      .sort((a, b) => a.number - b.number);
    if (!logged.length) continue;
    const results = logged.map((set) => coachSetFromLog(set));
    const sets = results.map((set) => {
      const effort = set.rpe !== undefined && set.rpe >= 1 && set.rpe <= 10
        ? set.rpe
        : typeof set.rir === "number" && set.rir >= 0 && set.rir <= 10 ? 10 - set.rir : undefined;
      return { weight: set.weight, reps: set.reps, ...(effort === undefined ? {} : { effort }) };
    });
    exercises.push({ name: row.name, sets, loadMode: row.loadMode, repsMin: row.repsMin, repsMax: row.repsMax });
    workingSets += sets.length;
    for (const set of sets) {
      if (set.effort === undefined) continue;
      declared++;
      if (set.effort >= 7) effective++;
      else if (set.effort <= 6) easy++;
      if (set.effort >= 10) failure++;
    }
    const painful = results.filter((set) => set.pain).length, worse = results.filter((set) => set.technique === "degraded").length;
    pain += painful; degraded += worse;
    if (painful) painNames.push(row.name);
    if (worse) degradedNames.push(row.name);

    const catalog = data.exercises.find((exercise) => exercise.id === row.exerciseId);
    const primary = catalog?.muscleGroupId;
    if (primary) muscleSets.set(primary, (muscleSets.get(primary) ?? 0) + sets.length);
    for (const id of secondaryMuscleGroups(catalog, groups))
      muscleSets.set(id, (muscleSets.get(id) ?? 0) + sets.length * 0.5);

    const first = sets[0], last = sets[sets.length - 1], drop = first.reps - last.reps;
    if (sets.length >= 2 && Math.abs(first.weight - last.weight) < 0.000001 && drop >= 3 && drop >= first.reps * 0.3) {
      const rest = coachRestSeconds(row.repsMin ?? 8, row.repsMax ?? row.repsMin ?? 12, isCompoundExercise(catalog ?? row)) + 30;
      drops.push({
        tone: "info",
        title: `${row.name}: calo tra le serie`,
        text: `Da ${first.reps} a ${last.reps} ripetizioni allo stesso carico: il limite è il recupero. Prova circa ${minutes(rest)} tra le serie per tenere le ripetizioni.`,
      });
    }
  }
  if (!workingSets) return null;

  const muscles: CoachReviewMuscle[] = [...muscleSets.entries()]
    .map(([id, session]) => ({
      id,
      name: groups.find((group) => group.id === id)?.name ?? id,
      session,
      weekly: weeklyMuscleSets(data, id, workout.date),
    }))
    .sort((a, b) => b.session - a.session || a.name.localeCompare(b.name, "it"));

  const insights: CoachInsight[] = [];
  if (pain)
    insights.push({
      tone: "warn",
      title: "Dolore segnalato",
      text: `${plural(pain, "serie", "serie")} con dolore (${painNames.join(", ")}): non allenarti sopra il dolore. Se si ripete nelle prossime sedute, fatti valutare da un professionista.`,
    });
  if (degraded)
    insights.push({
      tone: "warn",
      title: "Tecnica da curare",
      text: `Tecnica peggiorata in ${plural(degraded, "serie", "serie")} (${degradedNames.join(", ")}): la prossima volta stesso carico, curando l'esecuzione prima di aumentare.`,
    });
  if (declared * 2 < workingSets)
    insights.push({
      tone: "info",
      title: "Registra lo sforzo",
      text: `Sforzo indicato in ${declared} serie su ${workingSets}. Con RPE o ripetizioni in riserva il Coach riconosce quando salire, quando sei in calo e quando serve scaricare.`,
    });
  if (declared >= 3) {
    if (failure >= 3 && failure * 10 >= declared * 3)
      insights.push({
        tone: "warn",
        title: "Troppo cedimento",
        text: `${plural(failure, "serie", "serie")} a cedimento su ${declared}: va bene ogni tanto, ma il cedimento sistematico aumenta la fatica senza dare più crescita. Lascia 1–2 ripetizioni in riserva nelle prime serie e spingi solo nell'ultima.`,
      });
    if (easy * 10 >= declared * 3)
      insights.push({
        tone: "warn",
        title: "Serie troppo facili",
        text: `${plural(easy, "serie", "serie")} con 4 o più ripetizioni in riserva: stimolano poco la crescita. Avvicinati a 1–3 in riserva aumentando carico o ripetizioni.`,
      });
    else if (effective * 10 >= declared * 7 && failure * 4 <= declared)
      insights.push({
        tone: "good",
        title: "Sforzo ben dosato",
        text: `${effective} serie su ${declared} nella fascia utile (0–3 ripetizioni in riserva): stimolo efficace con una fatica gestibile.`,
      });
  }
  insights.push(...drops.slice(0, 2));
  const trained = muscles.filter((muscle) => muscle.session >= 1);
  const volume: CoachInsight[] = [];
  for (const muscle of trained) {
    if (muscle.session >= 11)
      volume.push({
        tone: "info",
        title: `${muscle.name}: tante serie in una seduta`,
        text: `${number(muscle.session)} serie oggi: oltre circa 10 serie dirette nella stessa seduta il beneficio aggiunto cala. Meglio dividerle su due giorni della settimana.`,
      });
    else if (muscle.weekly > 20)
      volume.push({
        tone: "warn",
        title: `${muscle.name}: volume alto`,
        text: `${number(muscle.weekly)} serie negli ultimi 7 giorni: oltre le 20 il beneficio in più è piccolo e la fatica cresce. Se le prestazioni calano, togli qualche serie.`,
      });
    else if (muscle.weekly >= 10)
      continue;
    else if (muscle.session >= 2)
      volume.push({
        tone: "info",
        title: `${muscle.name}: volume basso`,
        text: `${number(muscle.weekly)} serie negli ultimi 7 giorni, sotto le 10 di riferimento: se l'obiettivo è la crescita, aggiungi 2–4 serie nella settimana.`,
      });
  }
  insights.push(...volume.slice(0, 3));
  if (!insights.some((item) => item.tone !== "info"))
    insights.push({
      tone: "good",
      title: "Seduta in linea",
      text: "Nessun errore di carico o di sforzo da correggere: la prossima volta segui le proposte del Coach Ombra.",
    });

  return { workingSets, declared, effective, easy, failure, pain, degraded, muscles, exercises, insights };
}
