import "@angular/compiler";
import "fake-indexeddb/auto";
import Dexie from "dexie";
import { expect, it } from "vitest";
import { GymDatabase } from "../src/app/core/database";
import { seed } from "../src/app/core/seed";
import { TABLES } from "../src/app/models/domain";
import { defaultExercises } from "../src/app/core/default-catalog";
it("adds distinct bench angles with blank videos and unique identifiers", () => {
  expect(new Set(defaultExercises.map((e) => e.id)).size).toBe(
    defaultExercises.length,
  );
  for (const id of [
    "library-dumbbells_dumbbell_bench_press",
    "variant-db-bench-30",
    "variant-db-bench-45",
    "variant-db-bench-decline-15",
    "variant-db-bench-neutral-30",
  ])
    expect(defaultExercises.find((e) => e.id === id)).toMatchObject({
      active: true,
      videoUrl: "",
      equipment: "Manubri",
    });
  expect(defaultExercises.every((e) => !e.videoUrl && !e.thumbnailUrl)).toBe(
    true,
  );
});
it("upgrades an existing offline archive once, preserving history, inactive flags and future admin links", async () => {
  const name = "catalog-upgrade-" + crypto.randomUUID();
  const old = new Dexie(name);
  old.version(3).stores({
    profiles: "id,role",
    roles: "id,&name",
    plans: "id,userId,active,archived",
    days: "id,planId,order",
    planExercises: "id,dayId,exerciseId",
    exercises: "id,name,muscleGroupId,equipment,active",
    muscleGroups: "id,&name",
    workouts: "id,userId,planId,dayId,date,status",
    workoutExercises: "id,workoutId,exerciseId",
    sets: "id,workoutExerciseId",
    settings: "id",
    meals: "id,date,name",
    scheduledWorkouts: "id,date,dayId,workoutId",
    measurements: "id,&date",
  });
  const data = seed();
  data.exercises = data.exercises.filter((e) => !e.id.startsWith("variant-"));
  Object.assign(data.exercises[0], {
    name: "La mia panca",
    active: false,
    videoUrl: "https://www.youtube.com/watch?v=abcdefghijk",
    thumbnailUrl: "https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg",
  });
  data.plans.push({
    id: "p",
    userId: "local",
    name: "Piano salvato",
    description: "Conserva",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    active: true,
    archived: false,
  });
  for (const table of TABLES)
    if (old.tables.some((t) => t.name === table))
      await old.table(table).bulkPut(data[table]);
  old.close();
  const db = new GymDatabase(name);
  try {
    const upgraded = await db.snapshot();
    expect(upgraded.plans).toEqual(data.plans);
    expect(upgraded.exercises.find((e) => e.id === "exercise-0")).toMatchObject(
      { name: "La mia panca", active: false, videoUrl: "", thumbnailUrl: "" },
    );
    expect(
      upgraded.exercises.filter((e) => e.id.startsWith("variant-")),
    ).toHaveLength(
      defaultExercises.filter((e) => e.id.startsWith("variant-")).length,
    );
    await db.entity("exercises").update("exercise-0", {
      videoUrl: "https://example.com/nuovo-video.mp4",
    });
    db.close();
    const reopened = new GymDatabase(name);
    try {
      expect(
        (await reopened.snapshot()).exercises.find((e) => e.id === "exercise-0")
          ?.videoUrl,
      ).toBe("https://example.com/nuovo-video.mp4");
    } finally {
      reopened.close();
    }
  } finally {
    await db.delete();
  }
});

it("upgrades v4 to v5 without overwriting customized exercises, videos or linked plans", async () => {
  const name = "catalog-v5-" + crypto.randomUUID(),
    old = new Dexie(name);
  old.version(4).stores({
    profiles: "id,role",
    roles: "id,&name",
    plans: "id,userId,active,archived",
    days: "id,planId,order",
    planExercises: "id,dayId,exerciseId",
    exercises: "id,name,muscleGroupId,equipment,active",
    muscleGroups: "id,&name",
    workouts: "id,userId,planId,dayId,date,status",
    workoutExercises: "id,workoutId,exerciseId",
    sets: "id,workoutExerciseId",
    settings: "id",
    meals: "id,date,name",
    scheduledWorkouts: "id,date,dayId,workoutId",
    measurements: "id,&date",
  });
  const data = seed();
  data.exercises = data.exercises.filter(
    (e) => !e.id.startsWith("variant-v2-"),
  );
  Object.assign(
    data.exercises.find((e) => e.id === "exercise-4")!,
    {
      name: "La mia lat machine",
      active: false,
      videoUrl: "https://example.com/video-aggiunto.mp4",
      tags: ["Personalizzato"],
    },
  );
  const time = new Date().toISOString();
  data.plans.push({
    id: "p",
    userId: "local",
    name: "Lat e braccia",
    description: "Conserva",
    createdAt: time,
    updatedAt: time,
    active: true,
    archived: false,
  });
  data.days.push({ id: "d", planId: "p", name: "Giorno 1", order: 0 });
  data.planExercises.push({
    id: "pe",
    dayId: "d",
    exerciseId: "exercise-4",
    sets: 3,
    repsMin: 8,
    repsMax: 12,
    rest: 90,
    notes: "I miei carichi",
    order: 0,
    targetWeight: 50,
  });
  for (const table of TABLES)
    if (old.tables.some((t) => t.name === table))
      await old.table(table).bulkPut(data[table]);
  old.close();
  const db = new GymDatabase(name);
  try {
    const result = await db.snapshot();
    expect(db.verno).toBe(8);
    expect(result.planExercises).toEqual(data.planExercises);
    expect(result.plans).toEqual(data.plans);
    expect(result.exercises).toHaveLength(253);
    expect(result.exercises.find((e) => e.id === "exercise-4")).toMatchObject({
      name: "La mia lat machine",
      active: false,
      videoUrl: "https://example.com/video-aggiunto.mp4",
      tags: ["Personalizzato", "Lat machine"],
    });
    expect(
      result.exercises.find((e) => e.id === "variant-v2-lat-prona-media"),
    ).toMatchObject({ active: true, videoUrl: "" });
  } finally {
    await db.delete();
  }
});

it("covers the requested families with correct equipment and independent load modes", async () => {
  const { defaultExercises: serverExercises } =
    await import("../worker/default-catalog.js");
  expect(serverExercises).toEqual(defaultExercises);
  for (const family of [
    "Lat machine",
    "Chest press",
    "Croci ai cavi",
    "Bicipiti",
    "Tricipiti",
  ])
    expect(
      defaultExercises.filter((e) => e.tags.includes(family)).length,
    ).toBeGreaterThanOrEqual(10);
  for (const id of [
    "variant-v2-lat-neutra-larga",
    "variant-v2-chest-dischi-inclinata",
    "variant-v2-croci-panca-30",
    "variant-v2-curl-bayesian",
    "variant-v2-pushdown-v",
  ])
    expect(defaultExercises.find((e) => e.id === id)).toMatchObject({
      active: true,
      videoUrl: "",
    });
  expect(
    defaultExercises.find((e) => e.id === "variant-v2-dip-assisted")?.loadMode,
  ).toBe("assisted");
  expect(
    defaultExercises.find((e) => e.id === "variant-v2-dip-weighted")?.loadMode,
  ).toBe("weighted-bodyweight");
});
