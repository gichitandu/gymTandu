import "@angular/compiler";
import "fake-indexeddb/auto";
import { describe, expect, it, vi } from "vitest";
import { seed } from "../src/app/core/seed";
import { GymDatabase } from "../src/app/core/database";
import {
  historyReductions,
  losesRecordedWork,
  recoverWorkout,
  workoutGraph,
} from "../src/app/services/workout-safety";
import { validateIntegrity } from "../src/app/services/integrity";

function completed() {
  const data = seed(),
    at = "2026-11-03T17:00:00Z";
  data.workouts.push({
    id: "today",
    userId: "local",
    planId: "p",
    dayId: "d",
    planName: "Piano otto settimane",
    dayName: "Seduta A",
    date: "2026-11-03",
    startedAt: at,
    endedAt: "2026-11-03T18:00:00Z",
    duration: 60,
    status: "completed",
    notes: "Allenamento concluso",
  });
  data.workoutExercises.push({
    id: "exercise-log",
    workoutId: "today",
    exerciseId: "exercise-0",
    name: "Panca",
    loadMode: "external",
    order: 0,
    rest: 90,
    notes: "Tecnica controllata",
  });
  data.sets.push(
    {
      id: "warmup",
      workoutExerciseId: "exercise-log",
      number: 1,
      weight: 20,
      reps: 12,
      kind: "warmup",
      completed: true,
    },
    {
      id: "work",
      workoutExerciseId: "exercise-log",
      number: 2,
      weight: 72.5,
      reps: 9,
      kind: "work",
      completed: true,
    },
  );
  return data;
}

describe("recorded workout regression detection and targeted recovery", () => {
  it("detects removed workouts, reopened status, removed sets, lost flags, weights and repetitions", () => {
    const original = completed();
    for (const patch of [
      (data: any) => {
        data.workouts = [];
        data.workoutExercises = [];
        data.sets = [];
      },
      (data: any) => (data.workouts[0].status = "draft"),
      (data: any) => data.sets.pop(),
      (data: any) => (data.sets[1].completed = false),
      (data: any) => (data.sets[1].weight = 0),
      (data: any) => (data.sets[1].reps = 1),
    ]) {
      const stale = structuredClone(original);
      patch(stale);
      expect(losesRecordedWork(original, stale)).toBe(true);
    }
    const newer = structuredClone(original);
    newer.profiles[0].name = "Giacomo";
    newer.workouts[0].notes = "Nota più recente";
    expect(losesRecordedWork(original, newer)).toBe(false);
  });
  it("describes exact intentional reductions separately from a stale copy with no known prior progress", () => {
    const before = completed(),
      after = completed();
    after.sets.pop();
    expect(historyReductions(before, after)).toEqual({
      workouts: [],
      sets: ["work"],
    });
    after.workouts = [];
    after.workoutExercises = [];
    after.sets = [];
    expect(historyReductions(before, after)).toEqual({
      workouts: ["today"],
      sets: ["warmup", "work"],
    });
    expect(historyReductions(seed(), seed())).toEqual({
      workouts: [],
      sets: [],
    });
  });
  it("restores one completed workout while preserving another session, current preferences, plan and extra recorded sets", () => {
    const source = completed(),
      current = completed();
    current.workouts[0].status = "draft";
    current.sets[1].completed = false;
    current.sets[1].weight = 0;
    current.settings[0].unit = "lb";
    current.profiles[0].name = "Giacomo";
    current.workouts.push({
      ...source.workouts[0],
      id: "other",
      date: "2026-11-01",
      notes: "Altra seduta conservata",
    });
    current.sets.push({
      ...source.sets[1],
      id: "extra",
      number: 3,
      weight: 75,
    });
    const before = structuredClone(current),
      next = recoverWorkout(current, source, "today");
    validateIntegrity(next);
    expect(next.workouts.find((row) => row.id === "today")?.status).toBe(
      "completed",
    );
    expect(next.sets.find((row) => row.id === "work")).toMatchObject({
      weight: 72.5,
      reps: 9,
      completed: true,
    });
    expect(next.sets.find((row) => row.id === "extra")).toMatchObject({
      weight: 75,
      completed: true,
    });
    expect(next.workouts.find((row) => row.id === "other")).toEqual(
      before.workouts.find((row) => row.id === "other"),
    );
    expect(next.settings).toEqual(before.settings);
    expect(next.profiles).toEqual(before.profiles);
    expect(next.plans).toEqual(before.plans);
    expect(current).toEqual(before);
  });
  it("recovers missing snapshots without inventing plan or catalog changes", () => {
    const next = recoverWorkout(seed(), completed(), "today");
    validateIntegrity(next);
    expect(next.plans).toEqual([]);
    expect(next.workouts).toHaveLength(1);
    expect(next.sets[1].weight).toBe(72.5);
  });
});

describe("durable device checkpoints", () => {
  it("retains completed progress and the version before a later history change across database reopen", async () => {
    const name = "checkpoint-" + crypto.randomUUID(),
      db = new GymDatabase(name),
      data = completed();
    try {
      await db.replace(data);
      expect((await db.recoverySnapshots())[0].data.sets[1].weight).toBe(72.5);
      const changed = await db.snapshot();
      changed.sets[1].weight = 0;
      changed.sets[1].completed = false;
      await db.replace(changed);
      const original = (await db.recoverySnapshots()).find(
        (row) => row.kind === "before-history-change",
      )!;
      expect(original.data.sets.find((row) => row.id === "work")).toMatchObject(
        { weight: 72.5, reps: 9, completed: true },
      );
      await db.checkpoint("before-update");
      db.close();
      const reopened = new GymDatabase(name);
      try {
        const snapshots = await reopened.recoverySnapshots();
        expect(snapshots.some((row) => row.kind === "before-update")).toBe(
          true,
        );
        const recovered = recoverWorkout(
          await reopened.snapshot(),
          snapshots.find((row) => row.kind === "before-history-change")!.data,
          "today",
        );
        await reopened.replace(recovered);
        expect(
          workoutGraph(await reopened.snapshot(), "today").sets.find(
            (row) => row.id === "work",
          )?.weight,
        ).toBe(72.5);
      } finally {
        reopened.close();
      }
    } finally {
      await db.delete();
    }
  });
  it("rolls back the entire data change if its required recovery snapshot cannot be written", async () => {
    const db = new GymDatabase("checkpoint-failure-" + crypto.randomUUID());
    try {
      await db.replace(completed());
      const before = await db.snapshot(),
        changed = structuredClone(before);
      changed.sets[1].completed = false;
      const meta = db.table("archiveMeta"),
        original = meta.put.bind(meta);
      const fault = vi
        .spyOn(meta, "put")
        .mockImplementation((row: any, ...args: any[]) =>
          row.id.startsWith("recovery:")
            ? (Promise.reject(Error("QuotaExceededError")) as any)
            : (original as any)(row, ...args),
        );
      await expect(db.replace(changed)).rejects.toThrow("QuotaExceededError");
      fault.mockRestore();
      expect(await db.snapshot()).toEqual(before);
    } finally {
      await db.delete();
    }
  });
  it("refuses to checkpoint a stale tab instead of allowing an update to hide another tab’s saved progress", async () => {
    const name = "checkpoint-conflict-" + crypto.randomUUID(),
      a = new GymDatabase(name),
      b = new GymDatabase(name);
    try {
      await a.replace(completed());
      await b.snapshot();
      const next = await a.snapshot();
      next.sets[1].weight = 80;
      await a.replace(next);
      await expect(b.checkpoint("before-update")).rejects.toThrow(
        "altra finestra",
      );
      expect((await a.snapshot()).sets[1].weight).toBe(80);
    } finally {
      b.close();
      await a.delete();
    }
  });
});
