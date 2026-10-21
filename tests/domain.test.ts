import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { GymDatabase } from "../src/app/core/database";
import { seed } from "../src/app/core/seed";
import { DataSet, now, uid } from "../src/app/models/domain";
import {
  epley,
  volume,
  sessionVolume,
  exerciseRecords,
  chartSeries,
} from "../src/app/services/statistics";
import {
  exportBackup,
  importBackup,
  validateIntegrity,
} from "../src/app/services/backup";
export function fixture(): DataSet {
  const d = seed();
  d.plans.push({
    id: "p",
    userId: "local",
    name: "Forza",
    description: "",
    createdAt: now(),
    updatedAt: now(),
    active: true,
    archived: false,
  });
  d.days.push({ id: "day", planId: "p", name: "Giorno A", order: 0 });
  d.planExercises.push({
    id: "pe",
    dayId: "day",
    exerciseId: "exercise-0",
    sets: 3,
    repsMin: 6,
    repsMax: 8,
    rest: 120,
    notes: "",
    order: 0,
  });
  for (let i = 0; i < 2; i++) {
    d.workouts.push({
      id: "w" + i,
      userId: "local",
      planId: "p",
      dayId: "day",
      planName: "Forza",
      dayName: "Giorno A",
      date: `2026-10-${10 + i}`,
      startedAt: `2026-10-${10 + i}T10:00:00Z`,
      endedAt: `2026-10-${10 + i}T11:00:00Z`,
      duration: 60,
      notes: "",
      status: "completed",
    });
    d.workoutExercises.push({
      id: "we" + i,
      workoutId: "w" + i,
      exerciseId: "exercise-0",
      name: "Panca piana",
      loadMode: "external",
      order: 0,
      rest: 120,
      notes: "",
    });
    d.sets.push({
      id: "s" + i,
      workoutExerciseId: "we" + i,
      number: 1,
      weight: 80 + i * 2.5,
      reps: 8,
      completed: true,
    });
  }
  return d;
}
const databases: GymDatabase[] = [];
afterEach(async () => {
  for (const db of databases.splice(0)) await db.delete();
});
describe("Statistiche", () => {
  it("applica Epley, distingue il massimo effettivo e ignora serie incomplete", () => {
    const d = fixture();
    d.sets.push({
      id: "ignored",
      workoutExerciseId: "we1",
      number: 2,
      weight: 200,
      reps: 8,
      completed: false,
    });
    expect(epley(80, 8)).toBeCloseTo(101.33333);
    expect(epley(0, 8)).toBe(0);
    const r = exerciseRecords(d, "exercise-0");
    expect(r.maxWeight).toBe(82.5);
    expect(r.estimated1RM).toBeCloseTo(104.5);
    expect(r.maxReps).toBe(8);
    expect(r.repsByWeight["82.5"]).toBe(8);
    expect(r.maxVolume).toBe(660);
    expect(sessionVolume(d, d.workouts[1])).toBe(660);
  });
  it("esclude corpo libero, assistenza e zavorra dal volume", () => {
    const d = fixture();
    for (const mode of [
      "bodyweight",
      "assisted",
      "weighted-bodyweight",
    ] as const)
      expect(volume(d.sets, mode)).toBe(0);
    d.workoutExercises.forEach((e) => (e.loadMode = "bodyweight"));
    d.exercises[0].loadMode = "bodyweight";
    expect(chartSeries(d, "exercise-0", "", 0, "volume")).toEqual([]);
    expect(chartSeries(d, "exercise-0", "", 0, "rm")).toEqual([]);
    expect(chartSeries(d, "exercise-0", "", 0, "weight")).toEqual([]);
    expect(
      chartSeries(d, "exercise-0", "", 0, "reps").map((p) => p.value),
    ).toEqual([8, 8]);
  });
  it("aggiorna progressione e volume settimanale dopo modifiche allo storico", () => {
    const d = fixture();
    expect(
      chartSeries(d, "exercise-0", "p", 0, "weight").map((p) => p.value),
    ).toEqual([80, 82.5]);
    expect(chartSeries(d, "exercise-0", "other", 0, "weight")).toEqual([]);
    expect(
      chartSeries(d, "", "", 0, "weekly").reduce((s, p) => s + p.value, 0),
    ).toBe(1300);
    d.sets[1].weight = 85;
    expect(exerciseRecords(d, "exercise-0").maxWeight).toBe(85);
    expect(sessionVolume(d, d.workouts[1])).toBe(680);
  });
  it("somma lo stesso esercizio ripetuto nella sessione per il record di volume", () => {
    const d = fixture();
    d.workoutExercises.push({ ...d.workoutExercises[1], id: "repeat" });
    d.sets.push({
      ...d.sets[1],
      id: "repeat-set",
      workoutExerciseId: "repeat",
    });
    expect(exerciseRecords(d, "exercise-0").maxVolume).toBe(1320);
  });
});
describe("Backup", () => {
  it("esporta e ripristina tutte le tabelle, impostazioni, draft e immagini Blob", async () => {
    const d = fixture();
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13]);
    d.exercises[0].image = new Blob([png], { type: "image/png" });
    d.workouts[1].status = "draft";
    const json = await exportBackup(d);
    const restored = await importBackup(json);
    expect(restored.plans).toEqual(d.plans);
    expect(restored.sets).toEqual(d.sets);
    expect(restored.workouts).toEqual(d.workouts);
    expect(restored.exercises[0].image).toBeInstanceOf(Blob);
    expect(await restored.exercises[0].image!.arrayBuffer()).toEqual(
      png.buffer,
    );
  });
  it("rifiuta JSON malformato e versioni future", async () => {
    await expect(importBackup("{")).rejects.toThrow("JSON");
    const raw = JSON.parse(await exportBackup(fixture()));
    raw.schemaVersion = 4;
    await expect(importBackup(JSON.stringify(raw))).rejects.toThrow("recente");
  });
  it("rifiuta dati mancanti, numeri non validi e riferimenti orfani", async () => {
    const raw = JSON.parse(await exportBackup(fixture()));
    delete raw.data.settings;
    await expect(importBackup(JSON.stringify(raw))).rejects.toThrow(
      "non validi",
    );
    const raw2 = JSON.parse(await exportBackup(fixture()));
    raw2.data.sets[0].weight = -1;
    await expect(importBackup(JSON.stringify(raw2))).rejects.toThrow(
      "non validi",
    );
    const raw3 = JSON.parse(await exportBackup(fixture()));
    raw3.data.sets[0].workoutExerciseId = "missing";
    await expect(importBackup(JSON.stringify(raw3))).rejects.toThrow(
      "mancante",
    );
  });
  it("rifiuta ID duplicati, serie duplicate e più piani attivi", () => {
    const d = fixture();
    d.sets.push({ ...d.sets[0], id: "new" });
    expect(() => validateIntegrity(d)).toThrow("duplicati");
    const d2 = fixture();
    d2.plans.push({ ...d2.plans[0], id: "p2" });
    expect(() => validateIntegrity(d2)).toThrow("attivi");
  });
  it("preserva gli snapshot storici anche dopo rimozione di giorni", async () => {
    const d = fixture();
    d.days = [];
    d.planExercises = [];
    const result = await importBackup(await exportBackup(d));
    expect(result.workouts[0].dayName).toBe("Giorno A");
  });
  it("rifiuta immagini con MIME incoerente", async () => {
    const d = fixture();
    const raw = JSON.parse(await exportBackup(d));
    raw.data.exercises[0].image = {
      mime: "image/png",
      data: btoa("not-a-real-image"),
    };
    await expect(importBackup(JSON.stringify(raw))).rejects.toThrow("Formato");
  });
});
describe("IndexedDB e transazioni", () => {
  it("crea, modifica e rilegge piani e catalogo dopo riapertura", async () => {
    const name = "test-" + uid();
    let db = new GymDatabase(name);
    const d = fixture();
    await db.replace(d);
    d.plans[0].name = "Forza aggiornata";
    await db.replace(d);
    db.close();
    db = new GymDatabase(name);
    databases.push(db);
    const stored = await db.snapshot();
    expect(stored.plans[0].name).toBe("Forza aggiornata");
    expect(stored.exercises.length).toBe(97);
    expect(stored.sets.length).toBe(2);
  });
  it("rifiuta restore inconsistente senza modificare i dati correnti", async () => {
    const db = new GymDatabase("test-" + uid());
    databases.push(db);
    const d = fixture();
    await db.replace(d);
    const bad = structuredClone(d);
    bad.days[0].planId = "missing";
    await expect(db.replace(bad)).rejects.toThrow("mancante");
    expect((await db.snapshot()).days[0].planId).toBe("p");
  });
  it("esegue rollback se un inserimento fallisce a metà transazione", async () => {
    const db = new GymDatabase("test-" + uid());
    databases.push(db);
    const d = fixture();
    await db.replace(d);
    const bad = structuredClone(d);
    bad.muscleGroups.push({ id: "dup-name", name: bad.muscleGroups[0].name });
    await expect(db.replace(bad)).rejects.toThrow();
    expect((await db.snapshot()).muscleGroups).toEqual(d.muscleGroups);
    expect((await db.snapshot()).workouts).toEqual(d.workouts);
  });
});
