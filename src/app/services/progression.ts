import { DataSet, TrainingPlanExercise } from "../models/domain";
import { hasSetup, setupKey } from "./training-flow";

export interface ProgressionProposal {
  status: "increase" | "maintain" | "unavailable";
  eligible: boolean;
  title: string;
  reason: string;
  incrementKg: number;
  previousWeight?: number;
  nextWeight?: number;
  target?: Pick<TrainingPlanExercise, "sets" | "repsMin" | "repsMax">;
  sourceDate?: string;
  sourceWorkoutId?: string;
}

/** An explainable double-progression check. All loads are stored in kg. */
export function weightProgression(
  data: DataSet,
  workoutExerciseId: string,
  incrementKg: number,
): ProgressionProposal {
  const base: ProgressionProposal = {
    status: "unavailable",
    eligible: false,
    title: "Costruiamo il prossimo passo",
    reason: "Inizia una sessione per valutare il carico.",
    incrementKg,
  };
  const current = data.workoutExercises.find((e) => e.id === workoutExerciseId);
  const workout = data.workouts.find((w) => w.id === current?.workoutId);
  const hold = (
    reason: string,
    title = "Consolida questo carico",
  ): ProgressionProposal => ({
    ...base,
    status: base.previousWeight === undefined ? "unavailable" : "maintain",
    title,
    reason,
  });
  if (!current || !workout || workout.status !== "draft") return base;
  if (!["external", "weighted-bodyweight"].includes(current.loadMode))
    return hold(
      "Per gli esercizi a corpo libero o con assistenza scegli il carico manualmente: la progressione richiede una valutazione diversa.",
    );
  if (!Number.isFinite(incrementKg) || incrementKg <= 0 || incrementKg > 50)
    return hold(
      "Scegli un incremento maggiore di zero, fino a 50 kg equivalenti, compatibile con l’attrezzatura.",
    );

  const entries = data.planExercises.filter(
    (e) => e.dayId === workout.dayId && e.exerciseId === current.exerciseId,
  );
  const orderedEntries = entries.filter((e) => e.order === current.order);
  const entry =
    entries.length === 1
      ? entries[0]
      : orderedEntries.length === 1
        ? orderedEntries[0]
        : undefined;
  if (
    !entry ||
    !Number.isInteger(entry.sets) ||
    entry.sets < 1 ||
    !Number.isInteger(entry.repsMin) ||
    !Number.isInteger(entry.repsMax) ||
    entry.repsMin < 1 ||
    entry.repsMax < entry.repsMin
  )
    return hold(
      "Serve un intervallo di ripetizioni valido nel piano attuale per confrontare le serie.",
    );
  base.target = {
    sets: entry.sets,
    repsMin: entry.repsMin,
    repsMax: entry.repsMax,
  };
  const pending = data.sets.filter(
    (s) =>
      s.workoutExerciseId === current.id && s.kind !== "warmup" && !s.completed,
  );
  if (!pending.length)
    return hold(
      "Hai già completato le serie di lavoro di questo esercizio.",
      "Serie completate",
    );

  // Never skip the latest comparable session just because an older one was better.
  const past = data.workouts
    .filter(
      (w) =>
        w.status === "completed" &&
        w.id !== workout.id &&
        w.startedAt <= workout.startedAt,
    )
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) || b.startedAt.localeCompare(a.startedAt),
    );
  for (const previous of past) {
    const matches = data.workoutExercises.filter(
      (e) =>
        e.workoutId === previous.id &&
        e.exerciseId === current.exerciseId &&
        e.loadMode === current.loadMode &&
        setupKey(e.machineSetup) === setupKey(current.machineSetup),
    );
    if (!matches.length) continue;
    const orderedMatches = matches.filter((e) => e.order === current.order);
    const previousExercise =
      orderedMatches.length === 1
        ? orderedMatches[0]
        : matches.length === 1
          ? matches[0]
          : undefined;
    if (!previousExercise)
      return hold(
        "Nell’ultima seduta l’esercizio compare più volte: scegli manualmente il riferimento per evitare confronti ambigui.",
      );
    const sets = data.sets.filter(
      (s) => s.workoutExerciseId === previousExercise.id && s.kind !== "warmup",
    );
    base.sourceDate = previous.date;
    base.sourceWorkoutId = previous.id;
    const completed = sets.filter((s) => s.completed);
    const first = completed[0];
    if (first && Number.isFinite(first.weight))
      base.previousWeight = first.weight;
    if (
      !sets.length ||
      completed.length !== sets.length ||
      sets.length < entry.sets
    )
      return hold(
        "L’ultima seduta confrontabile non contiene tutte le serie di lavoro richieste dal piano. Completa prima il volume previsto.",
      );
    if (
      sets.some(
        (s) =>
          !Number.isFinite(s.weight) ||
          s.weight < 0 ||
          (current.loadMode === "external" && s.weight === 0) ||
          !Number.isInteger(s.reps) ||
          s.reps < 1,
      )
    )
      return hold(
        "Controlla i carichi e le ripetizioni dell’ultima seduta prima di usarla come riferimento.",
      );
    if (sets.some((s) => Math.abs(s.weight - sets[0].weight) > 0.000001))
      return hold(
        "Nell’ultima seduta hai usato carichi diversi tra le serie. Mantieni una scelta manuale per questo schema.",
      );
    base.previousWeight = sets[0].weight;
    if (sets.some((s) => s.reps < entry.repsMax))
      return hold(
        `Raggiungi ${entry.repsMax} ripetizioni in tutte le serie di lavoro prima di aumentare il carico.`,
      );
    if (
      sets.some(
        (s) =>
          s.rpe === undefined ||
          !Number.isFinite(s.rpe) ||
          s.rpe < 1 ||
          s.rpe > 10,
      )
    )
      return hold(
        "Registra l’RPE in tutte le serie di lavoro: senza questo dato non propongo un aumento.",
      );
    if (sets.some((s) => s.rpe! > 8))
      return hold(
        "L’ultima seduta include serie con RPE superiore a 8. Consolida il carico prima di aumentarlo.",
      );
    const currentCompleted = data.sets.filter(
      (s) =>
        s.workoutExerciseId === current.id &&
        s.kind !== "warmup" &&
        s.completed,
    );
    if (
      currentCompleted.some(
        (s) =>
          s.rpe !== undefined &&
          (!Number.isFinite(s.rpe) || s.rpe < 1 || s.rpe > 10),
      )
    )
      return hold(
        "Controlla l’RPE delle serie già registrate nella seduta in corso prima di aumentare il carico.",
      );
    if (currentCompleted.some((s) => s.rpe !== undefined && s.rpe > 8))
      return hold(
        "Nella seduta in corso hai già registrato una serie con RPE superiore a 8. Mantieni il carico e valuta il recupero prima di aumentarlo.",
      );
    if (
      currentCompleted.some(
        (s) => !Number.isInteger(s.reps) || s.reps < entry.repsMin,
      )
    )
      return hold(
        "Una serie di lavoro della seduta in corso è sotto il minimo di ripetizioni previsto. Consolida il carico attuale prima di aumentarlo.",
      );
    const next = Math.round((sets[0].weight + incrementKg) * 1000000) / 1000000;
    base.nextWeight = next;
    if (pending.some((s) => s.weight > next + 0.000001))
      return hold(
        "Hai già impostato un carico superiore alla proposta in una serie da completare. Conserva la tua scelta o modificala manualmente.",
      );
    if (pending.every((s) => Math.abs(s.weight - next) < 0.000001))
      return hold(
        "Il carico proposto è già impostato sulle serie di lavoro da completare.",
        "Il prossimo passo è pronto",
      );
    return {
      ...base,
      status: "increase",
      eligible: true,
      title: "Pronto per un piccolo passo",
      reason: `Tutte le serie dell’ultima seduta confrontabile hanno raggiunto almeno ${entry.repsMax} ripetizioni con RPE fino a 8. Puoi provare l’incremento scelto, se la tecnica resta controllata.${hasSetup(current.machineSetup) ? "" : " Configurazione non registrata: verifica che attrezzatura e impostazioni siano le stesse."}`,
    };
  }
  return hold(
    "Non ci sono sedute completate con questo esercizio e la stessa configurazione della macchina. Registra una prima seduta di riferimento.",
  );
}
