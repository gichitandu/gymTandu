import { expect, it } from "vitest";
import { matchesExercise } from "../src/app/services/exercise-search";
import { seed } from "../src/app/core/seed";

const exercise = {
  ...seed().exercises[0],
  name: "Panca inclinata con manubri",
  equipment: "Manubri",
  tags: ["Petto"],
};

it("finds every typed word anywhere in the name, regardless of order or case", () => {
  expect(matchesExercise(exercise, " MANU   panca ")).toBe(true);
  expect(matchesExercise(exercise, "incl man")).toBe(true);
  expect(matchesExercise(exercise, "panca cavi")).toBe(false);
  expect(matchesExercise(exercise, "   ")).toBe(true);
});

it("supports accents, tags and the explicit name-only search", () => {
  const accented = { ...exercise, name: "Mobilità à terra" };
  expect(matchesExercise(accented, "mobilita terra", true)).toBe(true);
  expect(matchesExercise(exercise, "petto")).toBe(true);
  expect(matchesExercise(exercise, "petto", true)).toBe(false);
});
