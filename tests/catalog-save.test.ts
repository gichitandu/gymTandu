import "@angular/compiler";
import "fake-indexeddb/auto";
import {
  createEnvironmentInjector,
  EnvironmentInjector,
  runInInjectionContext,
} from "@angular/core";
import { FormBuilder } from "@angular/forms";
import { expect, it, vi } from "vitest";
import { GymDatabase } from "../src/app/core/database";
import { GYM_REPOSITORY } from "../src/app/repositories/repository";
import { Store } from "../src/app/services/store";
import { CatalogComponent } from "../src/app/features/catalog.component";

it("stores one catalog exercise when Save is submitted repeatedly, including after the first save resolves", async () => {
  vi.stubGlobal("document", { body: { classList: { toggle: () => {} } } });
  const db = new GymDatabase("catalog-save-" + crypto.randomUUID());
  const injector = createEnvironmentInjector(
    [
      {
        provide: GYM_REPOSITORY,
        useValue: {
          read: () => db.snapshot(),
          replace: (data: any) => db.replace(data),
        },
      },
      FormBuilder,
      Store,
    ],
    null as unknown as EnvironmentInjector,
  );
  const store = injector.get(Store);
  try {
    await vi.waitFor(() => expect(store.ready()).toBe(true));
    vi.spyOn(store, "canEditCatalog").mockReturnValue(true);
    const component = runInInjectionContext(
      injector,
      () => new CatalogComponent(),
    );
    component.open();
    component.form.patchValue({
      name: "Il mio esercizio",
      equipment: "Manubri",
      active: true,
    });
    await Promise.all([component.save(), component.save(), component.save()]);
    await component.save();
    const added = (await db.snapshot()).exercises.filter(
      (e) => e.name === "Il mio esercizio",
    );
    expect(added).toHaveLength(1);
    component.open(added[0]);
    component.form.patchValue({ name: "Esercizio modificato" });
    await component.save();
    expect(store.exercise(added[0].id)?.name).toBe("Esercizio modificato");
    expect(
      store.data().exercises.filter((e) => e.id === added[0].id),
    ).toHaveLength(1);
  } finally {
    await store.settled();
    injector.destroy();
    await db.delete();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});
