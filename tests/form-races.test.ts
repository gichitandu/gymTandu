import "@angular/compiler";
import {
  createEnvironmentInjector,
  EnvironmentInjector,
  runInInjectionContext,
} from "@angular/core";
import { FormBuilder } from "@angular/forms";
import { Router } from "@angular/router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CatalogComponent } from "../src/app/features/catalog.component";
import { PlansComponent } from "../src/app/features/plans.component";
import { Store } from "../src/app/services/store";
import { seed } from "../src/app/core/seed";
import * as images from "../src/app/services/images";

beforeEach(() => vi.stubGlobal("confirm", () => true));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function setup() {
  const data = seed();
  const store = {
    data: () => data,
    canEditCatalog: () => true,
    sharedCatalog: () => false,
    exercise: (id: string) => data.exercises.find((e) => e.id === id),
    savePlan: vi.fn(),
    saveExercise: vi.fn(),
    error: { set: vi.fn() },
  };
  const injector = createEnvironmentInjector(
    [
      FormBuilder,
      { provide: Store, useValue: store },
      { provide: Router, useValue: {} },
    ],
    null as unknown as EnvironmentInjector,
  );
  return {
    store,
    injector,
    create: <T>(make: () => T) => runInInjectionContext(injector, make),
  };
}

it("keeps the same plan editor and inputs while a slow save is pending, then enables retry", async () => {
  const t = setup();
  try {
    let complete!: (ok: boolean) => void;
    t.store.savePlan.mockImplementationOnce(
      () => new Promise<boolean>((resolve) => (complete = resolve)),
    );
    const component = t.create(() => new PlansComponent());
    component.openPlan();
    component.planForm.patchValue({ name: "La mia scheda" });
    const saving = component.savePlan();
    expect(component.planForm.disabled).toBe(true);
    component.closeModal();
    component.openDay("un-altro-piano");
    expect(component.modal()).toBe("plan");
    complete(false);
    await saving;
    expect(component.planForm.enabled).toBe(true);
    expect(component.planForm.controls.name.value).toBe("La mia scheda");
    t.store.savePlan.mockResolvedValue(true);
    await component.savePlan();
    expect(component.modal()).toBe("");
    expect(t.store.savePlan.mock.calls[0][0]).toBe(
      t.store.savePlan.mock.calls[1][0],
    );
  } finally {
    t.injector.destroy();
  }
});

it("keeps the catalog editor open on a failed slow save and blocks a different editor until it completes", async () => {
  const t = setup();
  try {
    let complete!: (ok: boolean) => void;
    t.store.saveExercise.mockImplementationOnce(
      () => new Promise<boolean>((resolve) => (complete = resolve)),
    );
    const component = t.create(() => new CatalogComponent());
    component.open();
    component.form.patchValue({
      name: "La mia variante",
      equipment: "Manubri",
    });
    const saving = component.save();
    component.dismiss();
    component.open(t.store.data().exercises[0]);
    expect(component.editing()).toBe(true);
    expect(component.form.getRawValue().name).toBe("La mia variante");
    expect(component.form.disabled).toBe(true);
    complete(false);
    await saving;
    expect(component.form.enabled).toBe(true);
    expect(component.editing()).toBe(true);
  } finally {
    t.injector.destroy();
  }
});

it("ignores photos that finish after removal or after opening another exercise and waits before saving a pending photo", async () => {
  const t = setup();
  try {
    const finish: ((photo: Blob) => void)[] = [];
    vi.spyOn(images, "compressPhoto").mockImplementation(
      () => new Promise<Blob>((resolve) => finish.push(resolve)),
    );
    const component = t.create(() => new CatalogComponent());
    component.open();
    component.form.patchValue({
      name: "La mia variante",
      equipment: "Manubri",
    });
    const event = () =>
      ({
        target: {
          files: [new Blob(["foto"], { type: "image/jpeg" })],
          value: "photo.jpg",
        },
      }) as unknown as Event;
    const old = component.image(event());
    await component.save();
    expect(t.store.saveExercise).not.toHaveBeenCalled();
    component.removeImage();
    finish[0](new Blob(["vecchia"]));
    await old;
    expect(component.imageBlob).toBeUndefined();
    const pending = component.image(event());
    component.dismiss();
    component.open();
    finish[1](new Blob(["altro esercizio"]));
    await pending;
    expect(component.imageBlob).toBeUndefined();
    expect(component.imageLoading()).toBe(false);
    const first = component.image(event()),
      second = component.image(event());
    const photo = new Blob(["ultima"]);
    finish[3](photo);
    await second;
    finish[2](new Blob(["prima"]));
    await first;
    expect(component.imageBlob).toBe(photo);
    expect(component.imageLoading()).toBe(false);
  } finally {
    t.injector.destroy();
  }
});
