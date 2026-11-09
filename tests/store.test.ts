import "@angular/compiler";
import "fake-indexeddb/auto";
import { createEnvironmentInjector, EnvironmentInjector } from "@angular/core";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Store } from "../src/app/services/store";
import { GymDatabase } from "../src/app/core/database";
import {
  GYM_REPOSITORY,
  GymRepository,
} from "../src/app/repositories/repository";
import { uid } from "../src/app/models/domain";
let db: GymDatabase;
let injector: EnvironmentInjector;
let s: Store;
beforeEach(async () => {
  vi.stubGlobal("document", { body: { classList: { toggle: () => {} } } });
  db = new GymDatabase("store-test-" + uid());
  const repo: GymRepository = {
    read: () => db.snapshot(),
    replace: (d) => db.replace(d),
  };
  injector = createEnvironmentInjector(
    [{ provide: GYM_REPOSITORY, useValue: repo }, Store],
    null as unknown as EnvironmentInjector,
  );
  s = injector.get(Store);
  await vi.waitFor(() => expect(s.ready()).toBe(true));
});
afterEach(async () => {
  injector.destroy();
  await db.delete();
  vi.unstubAllGlobals();
});
it("crea e modifica un piano con primo piano attivo e giorni indipendenti dal calendario", async () => {
  expect(await s.savePlan("p", "Upper / Lower", "Forza")).toBe(true);
  expect(s.activePlan()?.id).toBe("p");
  await s.savePlan("p2", "Altro", "");
  expect(s.data().plans.filter((p) => p.active)).toHaveLength(1);
  await s.savePlan("p", "Upper / Lower 2", "Nuova descrizione");
  await s.saveDay("a", "p", "Giorno A");
  await s.saveDay("b", "p", "Giorno B", 3);
  expect(s.days("p").map((d) => d.name)).toEqual(["Giorno A", "Giorno B"]);
  expect(s.days("p")[0].weekday).toBeUndefined();
  expect(s.data().plans[0].name).toBe("Upper / Lower 2");
  expect(await s.savePlan("bad", "  ", "")).toBe(false);
  expect(s.data().plans).toHaveLength(2);
});
it("serializza i check-in giornalieri con le altre modifiche e conserva una sola voce per data dopo la riapertura", async () => {
  const row = {
    id: "wellness-2026-11-02",
    date: "2026-11-02",
    sleepMinutes: 465,
    energy: 4,
    soreness: {},
    notes: "",
  };
  const [first, planSave, second] = await Promise.all([
    s.saveWellness(row),
    s.savePlan("p", "Piano conservato", ""),
    s.saveWellness({ ...row, id: "second-tap", notes: "Aggiornato" }),
  ]);
  expect([first, planSave, second]).toEqual([true, true, true]);
  expect(s.data().wellnessLogs).toHaveLength(1);
  expect(s.data().wellnessLogs[0].notes).toBe("Aggiornato");
  await s.init();
  expect(s.data().plans[0].name).toBe("Piano conservato");
  expect(s.data().wellnessLogs[0].sleepMinutes).toBe(465);
  expect(await s.saveWellness({ ...row, energy: 8 })).toBe(false);
  expect(s.data().wellnessLogs[0].energy).toBe(4);
});
async function plan() {
  await s.savePlan("p", "Forza", "");
  await s.saveDay("a", "p", "Giorno A");
  await s.savePlanExercise({
    id: "pe",
    dayId: "a",
    exerciseId: "exercise-0",
    sets: 2,
    repsMin: 8,
    repsMax: 10,
    rest: 120,
    notes: "Controlla la discesa",
    order: 0,
    targetWeight: 80,
  });
}
it("duplica piani e giorni senza condividere identificativi", async () => {
  await plan();
  await s.duplicatePlan("p");
  expect(s.data().plans).toHaveLength(2);
  const copy = s.data().plans[1];
  expect(copy.active).toBe(false);
  expect(s.days(copy.id)).toHaveLength(1);
  expect(s.planExercises(s.days(copy.id)[0].id)[0].id).not.toBe("pe");
  await s.duplicateDay("a");
  expect(s.days("p")).toHaveLength(2);
});
it("registra serie e recupera una sessione interrotta dal database", async () => {
  await plan();
  expect(await s.start("a")).toBe(true);
  const wid = s.draft()!.id;
  const e = s.workoutExercises(wid)[0];
  const set = s.sets(e.id)[0];
  await s.updateSet(set.id, { weight: 82.5, reps: 8, completed: true });
  await s.addSet(e.id);
  expect(s.sets(e.id)).toHaveLength(3);
  const stored = await db.snapshot();
  expect(stored.workouts[0].status).toBe("draft");
  expect(stored.sets.find((x) => x.id === set.id)!.weight).toBe(82.5);
  await s.init();
  expect(s.draft()!.id).toBe(wid);
  expect(s.sets(e.id)[0].completed).toBe(true);
  await s.removeSet(s.sets(e.id)[2].id);
  expect(s.sets(e.id)).toHaveLength(2);
  expect(await s.finish()).toBe(true);
  expect(s.draft()).toBeUndefined();
  expect(s.totalVolume()).toBe(660);
  expect(s.previous("exercise-0")[0].weight).toBe(82.5);
});
it("richiede una serie completata, conserva snapshot e copia le serie precedenti", async () => {
  await plan();
  await s.start("a");
  expect(await s.finish()).toBe(false);
  let e = s.workoutExercises(s.draft()!.id)[0];
  await s.updateSet(s.sets(e.id)[0].id, { completed: true });
  await s.finish();
  await s.saveExercise({
    ...s.exercise("exercise-0")!,
    name: "Panca rinominata",
  });
  expect(s.workoutExercises(s.completed()[0].id)[0].name).toBe("Panca piana");
  await s.start("a");
  e = s.workoutExercises(s.draft()!.id)[0];
  await s.copyPrevious(e.id);
  expect(s.sets(e.id)).toHaveLength(1);
  expect(s.sets(e.id)[0].completed).toBe(false);
  expect(s.sets(e.id)[0].weight).toBe(80);
});
it("elimina allenamento e serie, ricalcola statistiche e impedisce valori invalidi", async () => {
  await plan();
  await s.start("a");
  const w = s.draft()!;
  const e = s.workoutExercises(w.id)[0];
  const set = s.sets(e.id)[0];
  expect(await s.updateSet(set.id, { weight: -3 })).toBe(false);
  expect(s.sets(e.id)[0].weight).toBe(80);
  await s.updateSet(set.id, { completed: true });
  await s.finish();
  expect(s.recordCount()).toBe(1);
  expect(await s.deleteWorkout(w.id)).toBe(false);
  await s.reopenWorkout(w.id);
  await s.deleteWorkout(w.id);
  expect(s.data().workoutExercises).toHaveLength(0);
  expect(s.data().sets).toHaveLength(0);
  expect(s.totalVolume()).toBe(0);
  expect(s.recordCount()).toBe(0);
});
it("converte kg/lb senza cambiare il peso memorizzato", async () => {
  await s.change((d) => {
    d.settings[0].unit = "lb";
  });
  expect(s.weight(100)).toBeCloseTo(220.46226218);
  expect(s.kg(s.weight(100))).toBeCloseTo(100);
});

it("mantiene i dati precedenti in caso di errore di scrittura e serializza modifiche ravvicinate", async () => {
  await plan();
  const spy = vi
    .spyOn(db, "replace")
    .mockRejectedValueOnce(
      new DOMException("Quota piena", "QuotaExceededError"),
    );
  expect(await s.savePlan("p", "Non salvato", "")).toBe(false);
  expect(s.data().plans[0].name).toBe("Forza");
  expect(s.error()).toContain("Spazio locale esaurito");
  spy.mockRestore();
  await Promise.all([
    s.saveDay("b", "p", "Giorno B"),
    s.saveDay("c", "p", "Giorno C"),
  ]);
  expect(s.days("p")).toHaveLength(3);
  expect((await db.snapshot()).days).toHaveLength(3);
});
it("non copia carichi storici se la modalità del catalogo cambia", async () => {
  await plan();
  await s.start("a");
  const e = s.workoutExercises(s.draft()!.id)[0];
  await s.updateSet(s.sets(e.id)[0].id, { completed: true });
  await s.finish();
  await s.saveExercise({ ...s.exercise("exercise-0")!, loadMode: "assisted" });
  expect(s.previous("exercise-0")).toEqual([]);
  expect(s.records("exercise-0").maxWeight).toBe(0);
  expect(s.workoutExercises(s.completed()[0].id)[0].loadMode).toBe("external");
});

it("aggiorna l’ultima modifica anche per gli esercizi del piano, senza riscrivere le date di ripristino", async () => {
  await plan();
  await s.change(
    (d) => {
      d.plans[0].updatedAt = "2000-01-01T00:00:00.000Z";
    },
    "",
    false,
  );
  expect(s.data().plans[0].updatedAt).toBe("2000-01-01T00:00:00.000Z");
  await s.savePlanExercise({ ...s.data().planExercises[0], rest: 180 });
  expect(s.data().plans[0].updatedAt > "2000-01-01T00:00:00.000Z").toBe(true);
});
