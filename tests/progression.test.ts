import "@angular/compiler";
import "fake-indexeddb/auto";
import {
  createEnvironmentInjector,
  EnvironmentInjector,
  runInInjectionContext,
} from "@angular/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GymDatabase } from "../src/app/core/database";
import { seed } from "../src/app/core/seed";
import { DataSet, LoadMode } from "../src/app/models/domain";
import { GYM_REPOSITORY } from "../src/app/repositories/repository";
import { weightProgression } from "../src/app/services/progression";
import { Store } from "../src/app/services/store";
import { LoadProgressionComponent } from "../src/app/shared/load-progression.component";

function fixture(): DataSet {
  const d = seed();
  d.plans = [
    {
      id: "plan",
      userId: "local",
      name: "Piano",
      description: "",
      createdAt: "2026-10-01T10:00:00Z",
      updatedAt: "2026-10-01T10:00:00Z",
      active: true,
      archived: false,
    },
  ];
  d.days = [{ id: "day", planId: "plan", name: "Giorno 1", order: 0 }];
  d.planExercises = [
    {
      id: "entry",
      dayId: "day",
      exerciseId: "exercise-0",
      sets: 2,
      repsMin: 8,
      repsMax: 10,
      targetWeight: 80,
      rest: 90,
      notes: "",
      order: 0,
    },
  ];
  const history = {
    id: "history",
    userId: "local",
    planId: "plan",
    dayId: "day",
    planName: "Piano",
    dayName: "Giorno 1",
    date: "2026-10-19",
    startedAt: "2026-10-19T10:00:00Z",
    endedAt: "2026-10-19T11:00:00Z",
    duration: 3600,
    notes: "",
    status: "completed" as const,
  };
  d.workouts = [
    history,
    {
      ...history,
      id: "draft",
      date: "2026-10-21",
      startedAt: "2026-10-21T10:00:00Z",
      endedAt: undefined,
      status: "draft",
    },
  ];
  const exercise = {
    id: "past-exercise",
    workoutId: "history",
    exerciseId: "exercise-0",
    name: "Panca piana",
    loadMode: "external" as LoadMode,
    order: 0,
    rest: 90,
    notes: "",
    machineSetup: { machine: "Press A", seat: "4", grip: "Neutra" },
  };
  d.workoutExercises = [
    exercise,
    { ...structuredClone(exercise), id: "current", workoutId: "draft" },
  ];
  d.sets = [1, 2].flatMap((n) => [
    {
      id: "past-" + n,
      workoutExerciseId: "past-exercise",
      number: n,
      weight: 80,
      reps: 10,
      rpe: 8,
      completed: true,
    },
    {
      id: "current-" + n,
      workoutExerciseId: "current",
      number: n,
      kind: "work" as const,
      weight: 80,
      reps: 8,
      completed: false,
    },
  ]);
  return d;
}

describe("guided load progression", () => {
  it("proposes the selected increment after all top-range, moderate-effort working sets without changing data", () => {
    const d = fixture(),
      before = structuredClone(d);
    expect(weightProgression(d, "current", 1.25)).toMatchObject({
      status: "increase",
      eligible: true,
      previousWeight: 80,
      nextWeight: 81.25,
      incrementKg: 1.25,
      target: { sets: 2, repsMin: 8, repsMax: 10 },
      sourceDate: "2026-10-19",
      sourceWorkoutId: "history",
    });
    expect(d).toEqual(before);
  });
  it("compares exactly the same physical setup, including absent configuration, ignoring case, spacing and notes", () => {
    const d = fixture();
    d.workoutExercises[1].machineSetup = {
      machine: "  PRESS a ",
      seat: "4",
      grip: "neutra",
      notes: "Nuove note",
    };
    expect(weightProgression(d, "current", 2.5).eligible).toBe(true);
    d.workoutExercises[1].machineSetup = {
      machine: "Press B",
      seat: "4",
      grip: "Neutra",
    };
    expect(weightProgression(d, "current", 2.5).status).toBe("unavailable");
    d.workoutExercises[1].machineSetup = undefined;
    expect(weightProgression(d, "current", 2.5).eligible).toBe(false);
    d.workoutExercises[0].machineSetup = undefined;
    expect(weightProgression(d, "current", 2.5).eligible).toBe(true);
    expect(weightProgression(d, "current", 2.5).reason).toContain(
      "Configurazione non registrata",
    );
  });
  it("requires all planned working sets, including legacy sets, while incomplete warmups do not influence the proposal", () => {
    const d = fixture();
    d.sets.push({
      id: "warmup",
      workoutExerciseId: "past-exercise",
      number: 3,
      kind: "warmup",
      weight: 150,
      reps: 1,
      rpe: 10,
      completed: false,
    });
    expect(weightProgression(d, "current", 2.5).eligible).toBe(true);
    d.sets.find((s) => s.id === "past-2")!.completed = false;
    expect(weightProgression(d, "current", 2.5)).toMatchObject({
      status: "maintain",
      eligible: false,
    });
    d.sets = d.sets.filter((s) => s.id !== "past-2");
    expect(weightProgression(d, "current", 2.5).eligible).toBe(false);
  });
  it("holds the load below the top repetition target, without RPE, or above RPE 8", () => {
    const d = fixture(),
      s = d.sets.find((s) => s.id === "past-2")!;
    s.reps = 9;
    expect(weightProgression(d, "current", 2.5).reason).toContain(
      "10 ripetizioni",
    );
    s.reps = 10;
    s.rpe = undefined;
    expect(weightProgression(d, "current", 2.5).reason).toContain(
      "Registra l’RPE",
    );
    s.rpe = 8.5;
    expect(weightProgression(d, "current", 2.5).reason).toContain(
      "superiore a 8",
    );
  });
  it("does not choose an older successful session over the latest incomplete comparable session", () => {
    const d = fixture();
    d.workouts.push({
      ...d.workouts[0],
      id: "older",
      date: "2026-10-17",
      startedAt: "2026-10-17T10:00:00Z",
    });
    d.workoutExercises.push({
      ...d.workoutExercises[0],
      id: "older-exercise",
      workoutId: "older",
    });
    d.sets.push(
      ...d.sets
        .filter((s) => s.workoutExerciseId === "past-exercise")
        .map((s) => ({
          ...s,
          id: "older-" + s.id,
          workoutExerciseId: "older-exercise",
        })),
    );
    d.sets.find((s) => s.id === "past-2")!.completed = false;
    expect(weightProgression(d, "current", 2.5)).toMatchObject({
      eligible: false,
      sourceWorkoutId: "history",
    });
  });
  it("keeps heterogeneous loads manual and refuses unsupported modes or a changed load mode", () => {
    const d = fixture();
    d.sets.find((s) => s.id === "past-2")!.weight = 82.5;
    expect(weightProgression(d, "current", 2.5).reason).toContain(
      "carichi diversi",
    );
    for (const mode of ["bodyweight", "assisted"] as const) {
      d.workoutExercises[1].loadMode = mode;
      expect(weightProgression(d, "current", 2.5).status).toBe("unavailable");
    }
    d.workoutExercises[1].loadMode = "weighted-bodyweight";
    expect(weightProgression(d, "current", 2.5).eligible).toBe(false);
    d.workoutExercises[0].loadMode = "weighted-bodyweight";
    d.sets.find((s) => s.id === "past-2")!.weight = 80;
    expect(weightProgression(d, "current", 2.5).eligible).toBe(true);
  });
  it("validates increment and target data, and never lowers a higher manually entered current load", () => {
    const d = fixture();
    for (const increment of [0, -2, Infinity, NaN, 51])
      expect(weightProgression(d, "current", increment).eligible).toBe(false);
    d.sets.find((s) => s.id === "current-1")!.weight = 90;
    expect(weightProgression(d, "current", 2.5).reason).toContain(
      "carico superiore",
    );
    d.sets.find((s) => s.id === "current-1")!.weight = 80;
    d.planExercises[0].repsMax = 0;
    expect(weightProgression(d, "current", 2.5).status).toBe("unavailable");
  });
  it("uses current-session fatigue and missed minimum repetitions to hold an otherwise eligible increase, ignoring warmups", () => {
    const d = fixture(),
      current = d.sets.find((s) => s.id === "current-1")!;
    current.completed = true;
    current.rpe = 9;
    expect(weightProgression(d, "current", 2.5)).toMatchObject({
      eligible: false,
      status: "maintain",
    });
    expect(weightProgression(d, "current", 2.5).reason).toContain(
      "seduta in corso",
    );
    current.rpe = 8;
    current.reps = 7;
    expect(weightProgression(d, "current", 2.5).reason).toContain(
      "minimo di ripetizioni",
    );
    current.kind = "warmup";
    expect(weightProgression(d, "current", 2.5).eligible).toBe(true);
  });
  it("does not guess among duplicate exercise occurrences with ambiguous ordering", () => {
    const d = fixture();
    d.workoutExercises.push({ ...d.workoutExercises[0], id: "ambiguous" });
    expect(weightProgression(d, "current", 2.5).reason).toContain(
      "confronti ambigui",
    );
    d.workoutExercises.pop();
    d.planExercises.push({ ...d.planExercises[0], id: "ambiguous-entry" });
    expect(weightProgression(d, "current", 2.5).eligible).toBe(false);
  });
});

let db: GymDatabase | undefined,
  injector: EnvironmentInjector | undefined,
  store: Store | undefined;
afterEach(async () => {
  if (store) await store.settled();
  injector?.destroy();
  await db?.delete();
  db = undefined;
  injector = undefined;
  store = undefined;
  vi.unstubAllGlobals();
});
async function archive() {
  vi.stubGlobal("document", { body: { classList: { toggle: () => {} } } });
  db = new GymDatabase("progression-" + crypto.randomUUID());
  await db.replace(fixture());
  injector = createEnvironmentInjector(
    [
      {
        provide: GYM_REPOSITORY,
        useValue: {
          read: () => db!.snapshot(),
          replace: (d: DataSet) => db!.replace(d),
        },
      },
      Store,
    ],
    null as unknown as EnvironmentInjector,
  );
  store = injector.get(Store);
  await vi.waitFor(() => expect(store!.ready()).toBe(true));
  return store;
}
it("applies only after explicit confirmation, persists pending working loads and leaves completed sets, warmups, history and plan intact", async () => {
  const s = await archive();
  await s.change((d) => {
    d.sets.find((s) => s.id === "current-1")!.completed = true;
    d.sets.push({
      id: "current-warmup",
      workoutExerciseId: "current",
      number: 3,
      kind: "warmup",
      weight: 40,
      reps: 10,
      completed: false,
    });
    d.settings[0].unit = "lb";
  });
  const increment = s.kg(5),
    proposal = s.progression("current", increment);
  expect(proposal.eligible).toBe(true);
  expect(s.sets("current").find((s) => s.id === "current-2")!.weight).toBe(80);
  expect(await s.applyProgression("current", increment)).toBe(true);
  const persisted = await db!.snapshot();
  expect(persisted.sets.find((s) => s.id === "current-2")!.weight).toBeCloseTo(
    80 + 5 / 2.2046226218,
    5,
  );
  expect(persisted.sets.find((s) => s.id === "current-1")!.weight).toBe(80);
  expect(persisted.sets.find((s) => s.id === "current-warmup")!.weight).toBe(
    40,
  );
  expect(persisted.sets.find((s) => s.id === "past-2")!.weight).toBe(80);
  expect(persisted.planExercises[0].targetWeight).toBe(80);
  expect(s.progression("current", increment)).toMatchObject({
    eligible: false,
    title: "Il prossimo passo è pronto",
  });
});
it("re-evaluates after queued changes and rejects stale, completed or missing sessions without overwriting anything", async () => {
  const s = await archive();
  expect(s.progression("current", 2.5).eligible).toBe(true);
  const historyEdit = s.change((d) => {
    d.sets.find((s) => s.id === "past-2")!.rpe = 10;
  });
  const apply = s.applyProgression("current", 2.5);
  await historyEdit;
  expect(await apply).toBe(false);
  expect(s.error()).toContain("superiore a 8");
  expect(s.sets("current").every((s) => s.weight === 80)).toBe(true);
  await s.change((d) => {
    d.sets.find((s) => s.id === "past-2")!.rpe = 8;
    d.workouts.find((w) => w.id === "draft")!.status = "completed";
  });
  expect(await s.applyProgression("current", 2.5)).toBe(false);
  expect(await s.applyProgression("missing", 2.5)).toBe(false);
});
it("integrates increment selection and explicit UI confirmation with fractional lb conversion and reactive stale-proposal protection", async () => {
  const s = await archive();
  await s.change((d) => {
    d.settings[0].unit = "lb";
  });
  const ui = runInInjectionContext(
    injector!,
    () => new LoadProgressionComponent(),
  );
  Object.defineProperty(ui, "exerciseId", { value: () => "current" });
  ui.increment.set(1.25);
  const proposal = ui.proposal();
  expect(proposal.eligible).toBe(true);
  expect(proposal.incrementKg).toBeCloseTo(1.25 / 2.2046226218, 10);
  expect(s.sets("current").every((set) => set.weight === 80)).toBe(true);
  expect(ui.load(proposal.incrementKg)).toBe("1,25");
  await ui.apply();
  expect(
    s
      .sets("current")
      .every(
        (set) => Math.abs(set.weight - (80 + 1.25 / 2.2046226218)) < 0.000001,
      ),
  ).toBe(true);
  expect(ui.proposal().eligible).toBe(false);
  ui.increment.set(2.5);
  expect(ui.proposal().eligible).toBe(true);
  await s.change((d) => {
    d.sets.find((set) => set.id === "current-1")!.completed = true;
    d.sets.find((set) => set.id === "current-1")!.rpe = 9;
  });
  expect(ui.proposal().eligible).toBe(false);
  const before = structuredClone(s.data().sets);
  await ui.apply();
  expect(s.data().sets).toEqual(before);
});
