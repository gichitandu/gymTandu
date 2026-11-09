import "@angular/compiler";
import "fake-indexeddb/auto";
import Dexie from "dexie";
import { afterEach, expect, it } from "vitest";
import { GymDatabase } from "../src/app/core/database";
import { seed } from "../src/app/core/seed";
import { TABLES, uid, WellnessLog } from "../src/app/models/domain";
import {
  exportBackup,
  importBackup,
  validateIntegrity,
} from "../src/app/services/backup";
import { archiveHasContent } from "../src/app/services/archive-sync";
import { muscleWork } from "../src/app/services/wellness";
import { movementKind } from "../src/app/services/exercise-visual";
const databases: Dexie[] = [];
afterEach(async () => {
  for (const db of databases.splice(0)) await db.delete();
});
const log: WellnessLog = {
  id: "wellness-2026-11-02",
  date: "2026-11-02",
  sleepMinutes: 465,
  sleepQuality: 4,
  energy: 4,
  stress: 2,
  soreness: { "muscle-0": 1 },
  notes: "Diario di prova",
};
it("roundtrips wellness and appearance through backup and accepts a v10 archive without wellness", async () => {
  const data = seed();
  data.wellnessLogs.push(log);
  data.settings[0].neonGlow = 80;
  data.settings[0].dynamicBackground = false;
  data.settings[0].themeConfig = { palette: "blu-azzurro", mode: "dark" };
  const backup = await exportBackup(data),
    restored = await importBackup(backup);
  expect(restored.wellnessLogs).toEqual([log]);
  expect(restored.settings).toEqual(data.settings);
  const old = JSON.parse(backup);
  old.schemaVersion = 10;
  delete old.data.wellnessLogs;
  const migrated = await importBackup(JSON.stringify(old));
  expect(migrated.wellnessLogs).toEqual([]);
  expect(migrated.exercises).toHaveLength(data.exercises.length);
  expect(archiveHasContent(seed())).toBe(false);
  const wellnessOnly = seed();
  wellnessOnly.wellnessLogs.push(log);
  expect(archiveHasContent(wellnessOnly)).toBe(true);
});
it("upgrades a v7 archive additively and persists wellness in a separate account namespace", async () => {
  const name = "wellness-upgrade-" + uid(),
    old = new Dexie(name);
  databases.push(old);
  old.version(7).stores({
    ...Object.fromEntries(
      TABLES.filter((t) => t !== "wellnessLogs").map((t) => [t, "id"]),
    ),
    archiveMeta: "id",
  });
  const data = seed();
  data.profiles[0].name = "Archivio precedente";
  await old.open();
  for (const table of TABLES.filter((t) => t !== "wellnessLogs"))
    await old.table(table).bulkPut(data[table]);
  old.close();
  const db = new GymDatabase(name);
  databases.push(db);
  const upgraded = await db.snapshot();
  expect(upgraded.profiles[0].name).toBe("Archivio precedente");
  expect(upgraded.wellnessLogs).toEqual([]);
  upgraded.wellnessLogs.push(log);
  await db.replace(upgraded);
  db.close();
  const reopened = new GymDatabase(name);
  databases.push(reopened);
  expect((await reopened.snapshot()).wellnessLogs).toEqual([log]);
  const other = new GymDatabase(name + "-other-account");
  databases.push(other);
  await other.replace(seed());
  expect((await other.snapshot()).wellnessLogs).toEqual([]);
});
it("rejects duplicate days, invalid dates and out of range self-reports without replacing persisted data", async () => {
  const db = new GymDatabase("wellness-invalid-" + uid());
  databases.push(db);
  const data = seed();
  data.wellnessLogs.push(log);
  await db.replace(data);
  for (const patch of [
    { date: "2026-02-30" },
    { sleepMinutes: 1441 },
    { sleepMinutes: 465.5 },
    { energy: 6 },
    { stress: 0 },
    { sleepQuality: NaN },
    { soreness: { x: 5 } },
    { notes: "a".repeat(2001) },
  ]) {
    const bad = structuredClone(data);
    bad.wellnessLogs[0] = { ...log, ...patch };
    expect(() => validateIntegrity(bad)).toThrow();
    await expect(db.replace(bad)).rejects.toThrow();
  }
  const duplicate = structuredClone(data);
  duplicate.wellnessLogs.push({ ...log, id: "other" });
  expect(() => validateIntegrity(duplicate)).toThrow();
  expect((await db.snapshot()).wellnessLogs).toEqual([log]);
});
it("counts completed work by the catalog primary group, excludes drafts/warmup and preserves unmapped history", () => {
  const data = seed();
  data.workouts = [
    {
      id: "w",
      userId: "local",
      planId: "p",
      dayId: "d",
      planName: "P",
      dayName: "D",
      date: "2026-10-01",
      startedAt: "2026-11-02T12:00:00Z",
      status: "completed",
      duration: 30,
      notes: "",
    },
    {
      id: "draft",
      userId: "local",
      planId: "p",
      dayId: "d",
      planName: "P",
      dayName: "D",
      date: "2026-11-02",
      startedAt: "2026-11-02T12:00:00Z",
      status: "draft",
      duration: 0,
      notes: "",
    },
  ];
  data.workoutExercises = [
    "external",
    "bodyweight",
    "assisted",
    "weighted-bodyweight",
  ].map((loadMode, i) => ({
    id: "e" + i,
    workoutId: "w",
    exerciseId: "exercise-0",
    name: "E",
    loadMode: loadMode as any,
    order: i,
    rest: 60,
    notes: "",
  }));
  data.workoutExercises.push(
    {
      id: "unknown",
      workoutId: "w",
      exerciseId: "deleted",
      name: "Deleted exercise",
      loadMode: "external",
      order: 4,
      rest: 60,
      notes: "",
    },
    {
      id: "draft-e",
      workoutId: "draft",
      exerciseId: "exercise-0",
      name: "E",
      loadMode: "external",
      order: 0,
      rest: 60,
      notes: "",
    },
    {
      id: "unverified",
      workoutId: "w",
      exerciseId: "exercise-0",
      name: "E",
      loadMode: "external",
      loadUnit: "da verificare",
      order: 5,
      rest: 60,
      notes: "",
    },
  );
  data.sets = data.workoutExercises.map((e) => ({
    id: "s" + e.id,
    workoutExerciseId: e.id,
    number: 1,
    weight: 20,
    reps: 10,
    completed: true,
  }));
  data.sets.push(
    {
      id: "warmup",
      workoutExerciseId: "e0",
      number: 2,
      kind: "warmup",
      weight: 20,
      reps: 10,
      completed: true,
    },
    {
      id: "pending",
      workoutExerciseId: "e0",
      number: 3,
      weight: 100,
      reps: 10,
      completed: false,
    },
  );
  const result = muscleWork(data, "2026-10-01", "2026-11-02"),
    chest = result.find((g) => g.id === "muscle-0")!;
  expect(chest.sets).toBe(5);
  expect(chest.volume).toBe(200);
  expect(chest.lastDate).toBe("2026-10-01");
  expect(result.find((g) => g.id === "unmapped")?.sets).toBe(1);
  expect(
    muscleWork(data, "2026-11-01", "2026-11-02").every((g) => !g.sets),
  ).toBe(true);
});
it("only shows animations for the correct supported exercise variant and equipment", () => {
  const exercise = seed().exercises[0];
  expect(movementKind(exercise)).toBe("bench");
  for (const name of [
    "Panca inclinata",
    "Panca piana con manubri (0°)",
    "Panca declinata",
    "Panca piana presa stretta",
  ])
    expect(movementKind({ ...exercise, name })).toBeUndefined();
  expect(movementKind({ ...exercise, equipment: "Macchina" })).toBeUndefined();
  expect(movementKind({ ...exercise, loadMode: "bodyweight" })).toBeUndefined();
});
