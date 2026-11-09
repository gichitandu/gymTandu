import type { Exercise } from "../models/domain";
import { matchesExercise } from "./exercise-search";

/**
 * Search across the complete active catalog while preserving the existing
 * priority for exercises in the same muscle group as the original.
 * No limit here: paging belongs solely to the visual presentation.
 */
export function replacementCandidates(
  exercises: readonly Exercise[],
  original: Exercise | undefined,
  query: string,
  muscleGroupId = "",
): Exercise[] {
  return exercises
    .filter(
      (exercise) =>
        exercise.active &&
        exercise.id !== original?.id &&
        (!muscleGroupId || exercise.muscleGroupId === muscleGroupId) &&
        matchesExercise(exercise, query),
    )
    .sort(
      (a, b) =>
        Number(b.muscleGroupId === original?.muscleGroupId) -
          Number(a.muscleGroupId === original?.muscleGroupId) ||
        a.name.localeCompare(b.name, "it") ||
        a.id.localeCompare(b.id),
    );
}
