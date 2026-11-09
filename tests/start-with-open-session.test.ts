import "@angular/compiler";
import "fake-indexeddb/auto";
import { createEnvironmentInjector, EnvironmentInjector } from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { GymDatabase } from "../src/app/core/database";
import { GYM_REPOSITORY } from "../src/app/repositories/repository";
import { Store } from "../src/app/services/store";

let db: GymDatabase, injector: EnvironmentInjector, s: Store;
beforeEach(async () => {
  vi.stubGlobal("document", { body: { classList: { toggle() {} } } });
  db = new GymDatabase("gym-open-" + crypto.randomUUID());
  injector = createEnvironmentInjector(
    [
      {
        provide: GYM_REPOSITORY,
        useValue: {
          read: () => db.snapshot(),
          replace: (data: any) => db.replace(data),
        },
      },
      { provide: Router, useValue: { navigateByUrl: vi.fn() } },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { queryParamMap: { get: () => null } } },
      },
      Store,
    ],
    null as unknown as EnvironmentInjector,
  );
  s = injector.get(Store);
  await vi.waitFor(() => expect(s.ready()).toBe(true));
});
afterEach(async () => {
  await s.settled();
  injector.destroy();
  await db.delete();
  vi.unstubAllGlobals();
});

async function twoDays() {
  await s.savePlan("p", "Piano", "");
  for (const id of ["d1", "d2"]) {
    await s.saveDay(id, "p", "Giorno " + id);
    await s.savePlanExercise({
      id: "pe-" + id,
      dayId: id,
      exerciseId: "exercise-0",
      sets: 3,
      repsMin: 8,
      repsMax: 10,
      rest: 90,
      notes: "",
      order: 0,
    });
  }
}

it("riapre la stessa sessione se tocchi lo stesso giorno", async () => {
  await twoDays();
  expect(await s.start("d1")).toBe(true);
  const id = s.draft()!.id;
  expect(await s.start("d1")).toBe(true);
  expect(s.draft()!.id).toBe(id);
});

it("non apre in silenzio la sessione di un altro giorno", async () => {
  await twoDays();
  expect(await s.start("d1")).toBe(true);
  const id = s.draft()!.id;
  expect(await s.start("d2")).toBe(false);
  expect(s.error()).toContain("sessione aperta");
  expect(s.draft()!.id).toBe(id);
});
