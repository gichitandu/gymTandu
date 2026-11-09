import "@angular/compiler";
import "fake-indexeddb/auto";
import {
  createEnvironmentInjector,
  EnvironmentInjector,
  signal,
} from "@angular/core";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GymDatabase } from "../src/app/core/database";
import { GYM_REPOSITORY } from "../src/app/repositories/repository";
import { Store } from "../src/app/services/store";
import { AuthService } from "../src/app/services/auth";
import { ExcelProgramDraft } from "../src/app/models/excel-import";
import { exportBackup, importBackup } from "../src/app/services/backup";
import { effectiveProgramRange } from "../src/app/services/plan-program";
import { moveDate } from "../src/app/services/calendar";
import { localDate } from "../src/app/models/domain";

let db: GymDatabase, injector: EnvironmentInjector, s: Store;
const account = { id: "tandu", role: "SuperAdmin", owner: true };
let auth: {
  user: ReturnType<typeof signal<typeof account>>;
  offlineMode: () => boolean;
};
function draft(start = "2026-09-07", hash = "a".repeat(64)): ExcelProgramDraft {
  return {
    name: "Massa importata",
    description: "Indicazioni originali",
    weeks: 2,
    startDate: start,
    endDate: moveDate(start, 7),
    sourceName: "Programma.xlsx",
    sourceKind: "GT-1",
    fileHash: hash,
    warnings: [],
    sessions: [0, 1].map((i) => ({
      week: i + 1,
      date: moveDate(start, i * 7),
      title: "Petto",
      weekday: 1,
      phase: i ? "Progressione" : "Rientro",
      notes: "Note della seduta " + i,
      exercises: [
        {
          sourceId: "EX001",
          name: "Esercizio personale speciale",
          order: 0,
          sets: i ? 4 : 2,
          repsMin: 6,
          repsMax: 8,
          rest: 180,
          rirMin: i ? 1 : 3,
          rirMax: 3,
          warmupNotes: "Barra × 12; 35 kg × 6",
          reference: "55 kg · da confermare",
          loadUnit: "Da verificare",
          notes: "Tecnica e recupero",
        },
      ],
    })),
  };
}
beforeEach(async () => {
  vi.stubGlobal("document", { body: { classList: { toggle: () => {} } } });
  db = new GymDatabase("excel-core-" + crypto.randomUUID());
  auth = { user: signal(account), offlineMode: () => true };
  injector = createEnvironmentInjector(
    [
      { provide: AuthService, useValue: auth },
      {
        provide: GYM_REPOSITORY,
        useValue: {
          storageKey: db.name,
          read: () => db.snapshot(),
          replace: (data: any) => db.replace(data),
        },
      },
      Store,
    ],
    null as unknown as EnvironmentInjector,
  );
  s = injector.get(Store);
  await vi.waitFor(() => expect(s.ready()).toBe(true), { timeout: 5000 });
  await s.change(
    (data) => {
      data.profiles[0].name = "Tandu";
    },
    "",
    false,
  );
});
afterEach(async () => {
  await s.settled();
  injector.destroy();
  await db.delete();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("creates every dated prescription atomically without completed history and roundtrips all details in backup", async () => {
  await s.savePlan("old", "Piano precedente", "Da conservare");
  const before = structuredClone(s.data().plans[0]);
  const pid = await s.importExcelProgram(draft(), "first-import");
  expect(pid).toBe("excel-plan-first-import");
  expect(s.data().plans.find((plan) => plan.id === "old")).toEqual(before);
  expect(s.data().days).toHaveLength(2);
  expect(s.data().scheduledWorkouts).toHaveLength(2);
  expect(s.data().workouts).toHaveLength(0);
  expect(s.data().sets).toHaveLength(0);
  expect(
    s.data().days.map((day) => [day.week, day.weekday, day.sessionDate]),
  ).toEqual([
    [1, 0, "2026-09-07"],
    [2, 0, "2026-09-14"],
  ]);
  expect(s.data().planExercises.map((item) => item.sets)).toEqual([2, 4]);
  expect(
    s
      .data()
      .exercises.filter((item) => item.name === "Esercizio personale speciale"),
  ).toHaveLength(1);
  await s.change(
    (data) => {
      data.settings[0].archiveResetId = "one-time-reset";
    },
    "",
    false,
  );
  const restored = await importBackup(await exportBackup(s.data()));
  expect(restored.plans).toEqual(s.data().plans);
  expect(restored.days).toEqual(s.data().days);
  expect(restored.planExercises).toEqual(s.data().planExercises);
  expect(restored.settings[0].archiveResetId).toBe("one-time-reset");
});
it("coalesces repeated confirmations and identical file/start imports into one plan and calendar", async () => {
  const result = await Promise.all([
    s.importExcelProgram(draft(), "same"),
    s.importExcelProgram(draft(), "same"),
  ]);
  expect(result[0]).toBe(result[1]);
  expect(await s.importExcelProgram(draft(), "another-id")).toBe(result[0]);
  expect(s.data().plans).toHaveLength(1);
  expect(s.data().scheduledWorkouts).toHaveLength(2);
  const before = await db.snapshot();
  expect(
    await s.importExcelProgram(draft("2026-09-21", "c".repeat(64)), "same"),
  ).toBeNull();
  expect(await db.snapshot()).toEqual(before);
});
it("treats prototype-like spreadsheet IDs as ordinary source identifiers", async () => {
  const value = draft();
  for (const session of value.sessions) {
    session.exercises[0].sourceId = "constructor";
    delete session.exercises[0].loadUnit;
  }
  expect(await s.importExcelProgram(value, "safe-key", {})).not.toBeNull();
  expect(s.data().planExercises).toHaveLength(2);
  expect(
    s.data().planExercises.every((item) => item.loadUnit === "Da verificare"),
  ).toBe(true);
});
it("blocks the whole import for an existing workout on a different day inside its period and preserves all data", async () => {
  await s.savePlan("old", "Piano esistente", "");
  await s.saveDay("old-day", "old", "Seduta già programmata");
  await s.scheduleWorkout("2026-09-10", "old-day", "", "old-event");
  const before = await db.snapshot();
  expect(await s.importExcelProgram(draft(), "blocked")).toBeNull();
  expect(s.error()).toContain("10/09/2026");
  expect(s.error()).toContain("Piano esistente");
  expect(await db.snapshot()).toEqual(before);
});
it("rechecks conflicts against the latest queued state instead of trusting a clean preview", async () => {
  expect(s.excelProgramConflicts(draft())).toEqual([]);
  let release!: () => void;
  const pending = s.change(
    async (data) => {
      await new Promise<void>((resolve) => (release = resolve));
      data.workouts.push({
        id: "existing-workout",
        userId: "local",
        planId: "removed-plan",
        dayId: "removed-day",
        planName: "Storico conservato",
        dayName: "Seduta storica",
        date: "2026-09-09",
        startedAt: "2026-09-09T09:00:00Z",
        endedAt: "2026-09-09T10:00:00Z",
        duration: 60,
        notes: "",
        status: "completed",
      });
    },
    "",
    false,
  );
  const importing = s.importExcelProgram(draft(), "queued");
  await vi.waitFor(() => expect(release).toBeTypeOf("function"));
  release();
  await pending;
  expect(await importing).toBeNull();
  expect(s.data().plans).toHaveLength(0);
  expect(s.data().workouts).toHaveLength(1);
  expect(s.error()).toContain("09/09/2026");
});
it("requires a valid start date and guards a changed account before applying an import", async () => {
  const before = await db.snapshot(),
    invalid = { ...draft(), startDate: "" };
  expect(await s.importExcelProgram(invalid, "invalid")).toBeNull();
  expect(await db.snapshot()).toEqual(before);
  let release!: () => void;
  const pending = s.change(
    async () => new Promise<void>((resolve) => (release = resolve)),
    "",
    false,
  );
  const importing = s.importExcelProgram(draft(), "account-guard");
  await vi.waitFor(() => expect(release).toBeTypeOf("function"));
  auth.user.set({ ...account, id: "another" });
  release();
  await pending;
  expect(await importing).toBeNull();
  expect(s.data().plans).toHaveLength(0);
  expect(s.error()).toContain("account è cambiato");
});
it("links generic starts to the scheduled import day and snapshots RIR and guidance without duplicate sessions", async () => {
  const pid = await s.importExcelProgram(draft(), "snapshot"),
    event = s.data().scheduledWorkouts[0];
  expect(await s.start(event.dayId, event.date)).toBe(true);
  const workout = s.draft()!,
    exercise = s.workoutExercises(workout.id)[0];
  expect(s.data().scheduledWorkouts[0].workoutId).toBe(workout.id);
  expect(workout).toMatchObject({
    notes: "Note della seduta 0",
    programWeek: 1,
    programPhase: "Rientro",
  });
  expect(exercise).toMatchObject({
    repsMin: 6,
    repsMax: 8,
    rirMin: 3,
    rirMax: 3,
    warmupNotes: "Barra × 12; 35 kg × 6",
    reference: "55 kg · da confermare",
    loadUnit: "Da verificare",
  });
  await s.updateSet(s.sets(exercise.id)[0].id, {
    weight: 50,
    reps: 8,
    completed: true,
  });
  await s.finish();
  expect(
    s.data().plans.find((plan) => plan.id === pid)?.completedAt,
  ).toBeUndefined();
  expect(await s.start(event.dayId, event.date)).toBe(false);
  expect(s.data().workouts).toHaveLength(1);
});
it("concludes only after all scheduled workouts finish and reopens automatic completion coherently", async () => {
  const pid = await s.importExcelProgram(draft(), "automatic");
  for (const event of [...s.data().scheduledWorkouts]) {
    expect(await s.startScheduled(event.id, event.date)).toBe(true);
    const w = s.draft()!,
      ex = s.workoutExercises(w.id)[0];
    await s.updateSet(s.sets(ex.id)[0].id, {
      weight: 20,
      reps: 6,
      completed: true,
    });
    await s.finish();
  }
  expect(s.data().plans.find((plan) => plan.id === pid)).toMatchObject({
    completionReason: "automatic",
    archived: true,
    active: false,
  });
  expect(s.completed()).toHaveLength(2);
  const first = s.completed()[0];
  await s.reopenWorkout(first.id);
  expect(
    s.data().plans.find((plan) => plan.id === pid)?.completedAt,
  ).toBeUndefined();
  expect(s.data().sets.filter((set) => set.completed)).toHaveLength(2);
  await s.finish();
  expect(s.data().plans.find((plan) => plan.id === pid)?.completionReason).toBe(
    "automatic",
  );
  expect(s.data().workouts).toHaveLength(2);
});
it("ends a future plan once, frees cancelled dates and never deletes recorded data", async () => {
  const nextMonday = moveDate(localDate(), 7 + ((8 - new Date().getDay()) % 7));
  const future = draft(nextMonday),
    pid = await s.importExcelProgram(future, "future");
  expect(pid).not.toBeNull();
  expect(await s.finishPlan(pid!, true)).toBe(true);
  expect(s.data().scheduledWorkouts).toHaveLength(0);
  expect(effectiveProgramRange(s.data(), s.data().plans[0])).toBeNull();
  expect(s.data().plans[0]).toMatchObject({
    completionReason: "manual",
    archived: true,
  });
  expect(
    await s.importExcelProgram({ ...future, fileHash: "b".repeat(64) }, "next"),
  ).not.toBeNull();
  expect(s.data().plans).toHaveLength(2);
});
it("refuses plan closure while its workout is open and blocks manual scheduling inside another plan period", async () => {
  const pid = await s.importExcelProgram(draft(), "close");
  await s.startScheduled(s.data().scheduledWorkouts[0].id, "2026-09-07");
  const before = await db.snapshot();
  expect(await s.finishPlan(pid!)).toBe(false);
  expect(await db.snapshot()).toEqual(before);
  await s.savePlan("other", "Altro", "");
  await s.saveDay("other-day", "other", "Seduta");
  expect(await s.scheduleWorkout("2026-09-10", "other-day")).toBe(false);
  expect(s.error()).toContain("occupat");
  expect(await s.scheduleWorkout("2026-09-21", "other-day")).toBe(true);
});
it("blocks manual starts inside an imported period and imported starts colliding on their actual recording date", async () => {
  await s.importExcelProgram(draft(), "occupied");
  await s.savePlan("manual", "Manuale", "");
  await s.saveDay("manual-day", "manual", "Manuale");
  await s.savePlanExercise({
    id: "manual-entry",
    dayId: "manual-day",
    exerciseId: "exercise-0",
    sets: 1,
    repsMin: 8,
    repsMax: 8,
    rest: 90,
    notes: "",
    order: 0,
  });
  const before = await db.snapshot();
  expect(await s.start("manual-day", "2026-09-10")).toBe(false);
  expect(s.error()).toContain("occupat");
  expect(await db.snapshot()).toEqual(before);
  await s.change(
    (data) => {
      data.workouts.push({
        id: "other-workout",
        userId: "local",
        planId: "manual",
        dayId: "manual-day",
        planName: "Manuale",
        dayName: "Manuale",
        date: "2026-10-01",
        startedAt: "2026-10-01T09:00:00Z",
        endedAt: "2026-10-01T10:00:00Z",
        duration: 60,
        notes: "",
        status: "completed",
      });
    },
    "",
    false,
  );
  const current = await db.snapshot(),
    importedDay = s
      .data()
      .days.find((day) => day.planId === "excel-plan-occupied")!;
  expect(await s.start(importedDay.id, "2026-10-01")).toBe(false);
  expect(await db.snapshot()).toEqual(current);
});
it("preserves legacy manual workouts from two plans on the same day when no imported program is involved", async () => {
  for (const id of ["a", "b"]) {
    await s.savePlan(id, id, "");
    await s.saveDay("day-" + id, id, id);
    await s.savePlanExercise({
      id: "entry-" + id,
      dayId: "day-" + id,
      exerciseId: "exercise-0",
      sets: 1,
      repsMin: 8,
      repsMax: 8,
      rest: 90,
      notes: "",
      order: 0,
    });
  }
  expect(await s.start("day-a", "2026-09-10")).toBe(true);
  await s.finish(true);
  expect(await s.start("day-b", "2026-09-10")).toBe(true);
  expect(s.data().workouts).toHaveLength(2);
});
it("rolls back only a newly unconfirmed plan without removing other records and refuses after a session starts", async () => {
  await s.savePlan("keep", "Piano conservato", "");
  const existing = structuredClone(s.data().plans[0]),
    original = await db.snapshot();
  await s.importExcelProgram(draft(), "unconfirmed");
  expect(await s.removeUnconfirmedExcelImport("unconfirmed")).toBe(true);
  expect(s.data().plans).toEqual([existing]);
  expect(s.data().days).toHaveLength(0);
  expect(s.data().scheduledWorkouts).toHaveLength(0);
  expect(await db.snapshot()).toEqual(original);
  await s.importExcelProgram(draft(), "with-session");
  await s.startScheduled(s.data().scheduledWorkouts[0].id, "2026-09-07");
  const before = await db.snapshot();
  expect(await s.removeUnconfirmedExcelImport("with-session")).toBe(false);
  expect(await db.snapshot()).toEqual(before);
});
