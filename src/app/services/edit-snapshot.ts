import { DataSet } from "../models/domain";

/** Blob is immutable. Keep media identity while still isolating every mutable
 * record/array, so autosaving a set cannot reload unchanged images. */
export function cloneForEdit(source: DataSet): DataSet {
  const next = structuredClone(source);
  source.exercises.forEach((exercise, index) => {
    if (exercise.image) next.exercises[index].image = exercise.image;
  });
  source.profiles.forEach((profile, index) => {
    if (profile.photo) next.profiles[index].photo = profile.photo;
  });
  source.meals.forEach((meal, index) => {
    if (meal.photo) next.meals[index].photo = meal.photo;
  });
  return next;
}
