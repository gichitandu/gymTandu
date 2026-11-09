import "@angular/compiler";
import "fake-indexeddb/auto";
import { createEnvironmentInjector, EnvironmentInjector } from "@angular/core";
import { describe, expect, it, vi } from "vitest";
import { seed } from "../src/app/core/seed";
import { GymDatabase } from "../src/app/core/database";
import { DataSet } from "../src/app/models/domain";
import { GYM_REPOSITORY } from "../src/app/repositories/repository";
import { Store } from "../src/app/services/store";
import {
  previousWeekWorkout,
  reusableExerciseSets,
} from "../src/app/services/weekly-reuse";
import {
  replacePlanExercise,
  replaceWorkoutExercise,
} from "../src/app/services/exercise-replacement";
import { exportBackup, importBackup } from "../src/app/services/backup";
import { WorkoutStartOptionsService } from "../src/app/services/workout-start-options";

function fixture(): DataSet {
  const data = seed(),
    timestamp = "2026-09-01T12:00:00Z";
  data.plans.push({
    id: "p",
    userId: "local",
    name: "Otto settimane",
    description: "",
    active: true,
    archived: false,
    createdAt: timestamp,
    updatedAt: timestamp,
    program: {
      importId: "test-import",
      sourceName: "Originale.xlsx",
      sourceKind: "original",
      startDate: "2026-09-07",
      endDate: "2026-11-01",
      weeks: 8,
      fileHash: "a".repeat(64),
      importedAt: timestamp,
      sessionCount: 16,
    },
  });
  for (let week = 1; week <= 8; week++)
    for (const [slot, weekday] of [1, 4].entries()) {
      const date = new Date("2026-09-07T12:00:00Z");
      date.setUTCDate(date.getUTCDate() + (week - 1) * 7 + slot * 3);
      const dayId = `w${week}-${slot}`,
        sessionDate = date.toISOString().slice(0, 10);
      data.days.push({
        id: dayId,
        planId: "p",
        name: slot ? "Seduta B" : "Seduta A",
        order: (week - 1) * 2 + slot,
        week,
        weekday,
        sessionDate,
      });
      data.planExercises.push({
        id: "pe-" + dayId,
        dayId,
        exerciseId: "exercise-0",
        sets: week === 2 ? 4 : 3,
        repsMin: week === 2 ? 6 : 8,
        repsMax: week === 2 ? 8 : 10,
        rest: 90,
        warmupSets: 1,
        targetWeight: 10,
        notes: "Tecnica controllata",
        rirMin: 2,
        reference: "Carico della vecchia macchina",
        loadUnit: "kg",
        order: 0,
      });
      data.scheduledWorkouts.push({
        id: "event-" + dayId,
        planId: "p",
        dayId,
        planName: "Otto settimane",
        dayName: slot ? "Seduta B" : "Seduta A",
        date: sessionDate,
        notes: "",
        ...(week === 1 && slot === 0 ? { workoutId: "old" } : {}),
      });
    }
  data.workouts.push({
    id: "old",
    userId: "local",
    planId: "p",
    dayId: "w1-0",
    planName: "Otto settimane",
    dayName: "Seduta A",
    date: "2026-09-07",
    startedAt: "2026-09-07T12:00:00Z",
    endedAt: "2026-09-07T12:30:00Z",
    duration: 30,
    notes: "",
    status: "completed",
    programWeek: 1,
  });
  data.workoutExercises.push({
    id: "old-ex",
    workoutId: "old",
    exerciseId: "exercise-0",
    name: data.exercises.find((row) => row.id === "exercise-0")!.name,
    loadMode: "external",
    order: 0,
    rest: 90,
    notes: "",
  });
  for (const [index, [weight, reps, kind]] of (
    [
      [20, 12, "warmup"],
      [40, 6, "warmup"],
      [60, 10, "work"],
      [62.5, 9, "work"],
      [65, 8, "work"],
    ] as const
  ).entries())
    data.sets.push({
      id: "old-set-" + index,
      workoutExerciseId: "old-ex",
      number: index + 1,
      weight,
      reps,
      kind,
      rest: kind === "warmup" ? 45 : 90,
      notes: kind === "warmup" ? "Riscaldamento personale" : "",
      completed: true,
    });
  return data;
}

async function withStore(
  run: (
    store: Store,
    repo: {
      read: () => Promise<DataSet>;
      replace: (data: DataSet) => Promise<void>;
    },
    database: GymDatabase,
  ) => Promise<void>,
) {
  vi.stubGlobal("document", { body: { classList: { toggle() {} } } });
  const database = new GymDatabase("weekly-reuse-" + crypto.randomUUID());
  await database.snapshot();
  await database.replace(fixture());
  const repo = {
    read: () => database.snapshot(),
    replace: (data: DataSet) => database.replace(data),
  };
  const injector = createEnvironmentInjector(
    [{ provide: GYM_REPOSITORY, useValue: repo }, Store],
    null as unknown as EnvironmentInjector,
  );
  const store = injector.get(Store);
  try {
    await vi.waitFor(() => expect(store.ready()).toBe(true));
    await run(store, repo, database);
    await store.settled();
  } finally {
    injector.destroy();
    await database.delete();
    vi.unstubAllGlobals();
  }
}

describe("weekly weights and warmup reuse", () => {
  it("selects the same training slot in the prior program week, not another day or plan", () => {
    const data = fixture();
    data.workouts.push({
      ...data.workouts[0],
      id: "other-slot",
      dayId: "w1-1",
      date: "2026-09-10",
    });
    data.workoutExercises.push({
      ...data.workoutExercises[0],
      id: "other-slot-ex",
      workoutId: "other-slot",
    });
    data.sets.push({
      ...data.sets[2],
      id: "other-slot-set",
      workoutExerciseId: "other-slot-ex",
      weight: 99,
    });
    expect(previousWeekWorkout(data, "w2-0", "2026-09-14")?.id).toBe("old");
    expect(previousWeekWorkout(data, "w2-1", "2026-09-17")?.id).toBe(
      "other-slot",
    );
    expect(previousWeekWorkout(data, "w1-0", "2026-09-07")).toBeUndefined();
  });
  it("does not reuse future, unfinished, mismatched-mode or other-plan history", () => {
    for (const patch of [
      { date: "2026-09-22" },
      { status: "draft" as const },
      { planId: "another-plan" },
    ]) {
      const data = fixture();
      Object.assign(data.workouts[0], patch);
      expect(previousWeekWorkout(data, "w2-0", "2026-09-14")).toBeUndefined();
    }
    const data = fixture();
    data.workoutExercises[0].loadMode = "bodyweight";
    expect(previousWeekWorkout(data, "w2-0", "2026-09-14")).toBeUndefined();
  });
  it("matches duplicate exercise occurrences and rejects a different machine configuration", () => {
    const data = fixture(),
      entry = {
        ...data.planExercises.find((row) => row.id === "pe-w2-0")!,
        id: "duplicate",
        order: 1,
      };
    data.planExercises.push(entry);
    data.workoutExercises.push({
      ...data.workoutExercises[0],
      id: "duplicate-old",
      order: 1,
    });
    data.sets.push({
      ...data.sets[2],
      id: "duplicate-weight",
      workoutExerciseId: "duplicate-old",
      weight: 90,
    });
    expect(
      reusableExerciseSets(data, data.workouts[0], entry).work.map(
        (row) => row.weight,
      ),
    ).toEqual([90]);
    expect(
      reusableExerciseSets(data, data.workouts[0], entry, {
        machine: "different",
      } as any).work,
    ).toEqual([]);
  });
  it("copies weights and custom warmups by default while preserving next-week counts, rep targets, history and pending flags", async () =>
    withStore(async (store, _, database) => {
      const old = structuredClone(store.data().sets);
      expect(await store.start("w2-0", "2026-09-14")).toBe(true);
      const exercise = store.workoutExercises(store.draft()!.id)[0],
        sets = store.sets(exercise.id);
      expect(
        sets
          .filter((row) => row.kind === "warmup")
          .map((row) => [row.weight, row.reps, row.rest]),
      ).toEqual([
        [20, 12, 45],
        [40, 6, 45],
      ]);
      expect(
        sets
          .filter((row) => row.kind === "work")
          .map((row) => [row.weight, row.reps]),
      ).toEqual([
        [60, 6],
        [62.5, 6],
        [65, 6],
        [65, 6],
      ]);
      expect(
        sets.every(
          (row) =>
            !row.completed && !old.some((source) => source.id === row.id),
        ),
      ).toBe(true);
      expect(
        store.data().sets.filter((row) => row.workoutExerciseId === "old-ex"),
      ).toEqual(old);
      expect(
        (await database.snapshot()).sets
          .filter((row) => row.workoutExerciseId === exercise.id)
          .sort((a, b) => a.number - b.number),
      ).toEqual(sets);
    }));
  it("a session opt-out wins even if legacy prefill is enabled", async () =>
    withStore(async (store) => {
      await store.change(
        (data) => {
          data.settings[0].prefill = true;
        },
        "",
        false,
      );
      expect(
        await store.start("w2-0", "2026-09-14", { reusePreviousWeek: false }),
      ).toBe(true);
      const sets = store.sets(store.workoutExercises(store.draft()!.id)[0].id);
      expect(
        sets.filter((row) => row.kind === "warmup").map((row) => row.weight),
      ).toEqual([0]);
      expect(
        sets.filter((row) => row.kind === "work").map((row) => row.weight),
      ).toEqual([10, 10, 10, 10]);
    }));
  it("respects the disabled default and allows an explicit per-session opt-in", async () => {
    await withStore(async (store) => {
      await store.change(
        (data) => {
          data.settings[0].reusePreviousWeek = false;
        },
        "",
        false,
      );
      await store.start("w2-0", "2026-09-14");
      expect(
        store
          .sets(store.workoutExercises(store.draft()!.id)[0].id)
          .filter((row) => row.kind === "work")
          .map((row) => row.weight),
      ).toEqual([10, 10, 10, 10]);
    });
    await withStore(async (store) => {
      await store.change(
        (data) => {
          data.settings[0].reusePreviousWeek = false;
        },
        "",
        false,
      );
      await store.start("w2-0", "2026-09-14", { reusePreviousWeek: true });
      expect(
        store
          .sets(store.workoutExercises(store.draft()!.id)[0].id)
          .filter((row) => row.kind === "work")[0].weight,
      ).toBe(60);
    });
  });
  it("preserves the preference in backups and rejects non-boolean settings", async () => {
    const data = fixture();
    data.settings[0].reusePreviousWeek = false;
    expect(
      (await importBackup(await exportBackup(data))).settings[0]
        .reusePreviousWeek,
    ).toBe(false);
    (data.settings[0] as any).reusePreviousWeek = "false";
    await expect(exportBackup(data)).rejects.toThrow();
  });
  it("cancel and repeated start requests cannot silently accept the default option", async () => {
    const options = new WorkoutStartOptionsService();
    const pending = options.choose({
      dayName: "Seduta A",
      planName: "Piano",
      previousDate: "2026-09-07",
      defaultReuse: false,
    });
    expect(options.current()?.defaultReuse).toBe(false);
    expect(
      await options.choose({
        dayName: "B",
        planName: "Piano",
        previousDate: "2026-09-07",
        defaultReuse: true,
      }),
    ).toBeNull();
    options.answer(null);
    expect(await pending).toBeNull();
    expect(options.current()).toBeNull();
  });
});

describe("scoped plan exercise replacements", () => {
  const request = {
    sourceId: "pe-w2-0",
    replacementId: "exercise-4",
    expectedExerciseId: "exercise-0",
  };
  it.each([
    ["single", undefined, 1],
    ["all", undefined, 16],
    ["selected", ["w2-0", "w7-1"], 2],
  ] as const)(
    "applies scope %s exactly while preserving completed history and prescriptions",
    (scope, dayIds, count) => {
      const data = fixture(),
        history = structuredClone({
          workouts: data.workouts,
          exercises: data.workoutExercises,
          sets: data.sets,
        }),
        before = structuredClone(data.planExercises);
      const result = replacePlanExercise(data, { ...request, scope, dayIds });
      expect(result.changed).toBe(count);
      expect(result.activeChanged).toBe(false);
      expect(
        data.planExercises.filter(
          (row) => row.exerciseId === request.replacementId,
        ),
      ).toHaveLength(count);
      for (const row of data.planExercises) {
        const original = before.find((item) => item.id === row.id)!;
        if (row.exerciseId === request.replacementId) {
          expect(row).toMatchObject({
            sets: original.sets,
            repsMin: original.repsMin,
            repsMax: original.repsMax,
            rest: original.rest,
            warmupSets: original.warmupSets,
            rirMin: original.rirMin,
            notes: original.notes,
          });
          expect(row.targetWeight).toBeUndefined();
          expect(row.reference).toBeUndefined();
        } else expect(row).toEqual(original);
      }
      expect({
        workouts: data.workouts,
        exercises: data.workoutExercises,
        sets: data.sets,
      }).toEqual(history);
    },
  );
  it("does not affect another plan or duplicate exercise slots in single mode", () => {
    const data = fixture();
    data.plans.push({ ...data.plans[0], id: "other-plan", active: false });
    data.days.push({ ...data.days[0], id: "other-day", planId: "other-plan" });
    data.planExercises.push(
      { ...data.planExercises[0], id: "other-entry", dayId: "other-day" },
      {
        ...data.planExercises.find((row) => row.id === request.sourceId)!,
        id: "duplicate",
        order: 1,
      },
    );
    replacePlanExercise(data, { ...request, scope: "single" });
    expect(
      data.planExercises.find((row) => row.id === "duplicate")?.exerciseId,
    ).toBe("exercise-0");
    expect(
      data.planExercises.find((row) => row.id === "other-entry")?.exerciseId,
    ).toBe("exercise-0");
  });
  it.each([
    { scope: "selected", dayIds: [] },
    { scope: "selected", dayIds: ["missing"] },
    { scope: "selected", dayIds: ["w2-0", "w2-0"] },
    { scope: "all", expectedExerciseId: "changed" },
    { scope: "all", replacementId: "exercise-0" },
  ])("rejects invalid or stale requests without mutation %j", (patch) => {
    const data = fixture(),
      before = structuredClone(data);
    expect(() =>
      replacePlanExercise(data, { ...request, ...patch } as any),
    ).toThrow();
    expect(data).toEqual(before);
  });
  it("keeps already performed current sets on their original exercise when the plan is replaced", async () =>
    withStore(async (store) => {
      await store.start("w2-0", "2026-09-14", { reusePreviousWeek: false });
      const active = store.workoutExercises(store.draft()!.id)[0];
      await store.updateSet(store.sets(active.id)[0].id, {
        completed: true,
        weight: 20,
      });
      const before = structuredClone({
        exercise: active,
        sets: store.sets(active.id),
      });
      const result = await store.replacePlanExercise({
        ...request,
        scope: "all",
        workoutExerciseId: active.id,
      });
      expect(result).toMatchObject({
        changed: 16,
        activeChanged: false,
        activePreserved: true,
      });
      expect({
        exercise: store.workoutExercises(store.draft()!.id)[0],
        sets: store.sets(active.id),
      }).toEqual(before);
    }));
  it("updates an untouched current exercise alongside selected planned days and resets incompatible loads", async () =>
    withStore(async (store) => {
      await store.start("w2-0", "2026-09-14", { reusePreviousWeek: true });
      const active = store.workoutExercises(store.draft()!.id)[0];
      const result = await store.replacePlanExercise({
        ...request,
        scope: "selected",
        dayIds: ["w2-0", "w3-0"],
        workoutExerciseId: active.id,
      });
      expect(result).toMatchObject({ changed: 2, activeChanged: true });
      expect(store.workoutExercises(store.draft()!.id)[0]).toMatchObject({
        exerciseId: "exercise-4",
        substitutedFrom: { exerciseId: "exercise-0" },
      });
      expect(
        store
          .sets(active.id)
          .every((row) => row.weight === 0 && !row.completed),
      ).toBe(true);
    }));
  it("a failed archive write applies neither the plan nor the current exercise", async () =>
    withStore(async (store, repo) => {
      await store.start("w2-0", "2026-09-14", { reusePreviousWeek: false });
      const active = store.workoutExercises(store.draft()!.id)[0],
        before = structuredClone(store.data());
      const fault = vi
        .spyOn(repo, "replace")
        .mockRejectedValueOnce(Error("Storage full"));
      expect(
        await store.replacePlanExercise({
          ...request,
          scope: "all",
          workoutExerciseId: active.id,
        }),
      ).toBeNull();
      expect(store.data()).toEqual(before);
      fault.mockRestore();
    }));
  it("a session-only change never rewrites the plan or an already recorded set", async () =>
    withStore(async (store) => {
      await store.start("w2-0", "2026-09-14", { reusePreviousWeek: false });
      const active = store.workoutExercises(store.draft()!.id)[0],
        plan = structuredClone(store.data().planExercises);
      expect(
        await store.substituteWorkoutExercise(active.id, "exercise-4"),
      ).toBe(true);
      expect(store.data().planExercises).toEqual(plan);
      await store.updateSet(store.sets(active.id)[0].id, { completed: true });
      const before = structuredClone(store.data());
      expect(() =>
        replaceWorkoutExercise(before, active.id, "exercise-0"),
      ).toThrow(/già eseguite/);
      expect(before).toEqual(store.data());
    }));
});
