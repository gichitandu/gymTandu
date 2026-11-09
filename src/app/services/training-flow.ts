import {
  MachineSetup,
  WorkoutLogExercise,
  WorkoutLogSet,
} from "../models/domain";
export function setupKey(setup?: MachineSetup) {
  return [setup?.machine, setup?.seat, setup?.backrest, setup?.grip]
    .map((v) => (v || "").trim().toLocaleLowerCase("it"))
    .join("|");
}
export function hasSetup(setup?: MachineSetup) {
  return (
    !!setup &&
    [setup.machine, setup.seat, setup.backrest, setup.grip].some(
      (v) => !!v?.trim(),
    )
  );
}
export function setupSummary(setup?: MachineSetup) {
  return setup
    ? [
        setup.machine,
        setup.seat ? "Sedile " + setup.seat : "",
        setup.backrest ? "Schienale " + setup.backrest : "",
        setup.grip ? "Presa " + setup.grip : "",
      ]
        .filter(Boolean)
        .join(" · ")
    : "";
}
export function supersetNext(
  exercises: WorkoutLogExercise[],
  sets: WorkoutLogSet[],
  currentId: string,
) {
  const current = exercises.find((e) => e.id === currentId);
  if (!current?.superset)
    return {
      immediate: false,
      next: undefined as WorkoutLogExercise | undefined,
    };
  const group = exercises
    .filter((e) => e.superset === current.superset)
    .sort((a, b) => a.order - b.order);
  if (group.length !== 2) return { immediate: false, next: undefined };
  const completed = (id: string) =>
    sets.filter(
      (s) => s.workoutExerciseId === id && s.kind !== "warmup" && s.completed,
    ).length;
  const pending = group.filter((e) =>
    sets.some((s) => s.workoutExerciseId === e.id && !s.completed),
  );
  const next = [...pending].sort(
    (a, b) => completed(a.id) - completed(b.id) || a.order - b.order,
  )[0];
  return {
    immediate:
      !!next &&
      next.id !== current.id &&
      completed(next.id) < completed(current.id),
    next,
  };
}
