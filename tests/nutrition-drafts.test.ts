import "@angular/compiler";
import {
  createEnvironmentInjector,
  EnvironmentInjector,
  runInInjectionContext,
  signal,
} from "@angular/core";
import { ActivatedRoute } from "@angular/router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NutritionComponent } from "../src/app/features/nutrition.component";
import { Store } from "../src/app/services/store";
import { LocalAiService } from "../src/app/services/local-ai";
import { FeedbackService } from "../src/app/services/feedback";
import { seed } from "../src/app/core/seed";
import { DataSet } from "../src/app/models/domain";
import * as images from "../src/app/services/images";

let injector: EnvironmentInjector, component: NutritionComponent;
let data: ReturnType<typeof signal<DataSet>>,
  store: {
    data: typeof data;
    ready: ReturnType<typeof signal<boolean>>;
    busy: ReturnType<typeof signal<boolean>>;
    change: ReturnType<typeof vi.fn>;
  };
const ai = { cancel: vi.fn(), run: vi.fn() };
beforeEach(() => {
  data = signal(seed());
  store = {
    data,
    ready: signal(true),
    busy: signal(false),
    change: vi.fn(async (fn: (draft: DataSet) => void) => {
      const draft = structuredClone(data());
      fn(draft);
      data.set(draft);
      return true;
    }),
  };
  ai.cancel.mockReset();
  ai.run.mockReset();
  ai.run.mockResolvedValue([]);
  vi.stubGlobal("window", { scrollTo: vi.fn() });
  injector = createEnvironmentInjector(
    [
      { provide: Store, useValue: store },
      { provide: LocalAiService, useValue: ai },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { queryParamMap: { get: () => null } } },
      },
      FeedbackService,
    ],
    null as unknown as EnvironmentInjector,
  );
  component = runInInjectionContext(injector, () => new NutritionComponent());
  component.openNew();
  component.name = "Pasto da salvare";
  component.calories = 250;
});
afterEach(() => {
  component.ngOnDestroy();
  injector.destroy();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

it("saves a single meal during repeated submits and keeps the active form locked until the save completes", async () => {
  const delayed = deferred<void>();
  store.change.mockImplementationOnce(async (fn: (draft: DataSet) => void) => {
    await delayed.promise;
    const draft = structuredClone(data());
    fn(draft);
    data.set(draft);
    return true;
  });
  const first = component.save();
  await component.save();
  await component.save();
  expect(store.change).toHaveBeenCalledTimes(1);
  expect(component.saving()).toBe(true);
  component.closeForm();
  component.openNew();
  expect(component.showForm()).toBe(true);
  expect(component.name).toBe("Pasto da salvare");
  delayed.resolve();
  await first;
  expect(data().meals).toHaveLength(1);
  expect(component.saving()).toBe(false);
  await component.save();
  expect(data().meals).toHaveLength(1);
  component.openNew();
  component.name = "Pasto successivo";
  await component.save();
  expect(data().meals).toHaveLength(2);
  expect(new Set(data().meals.map((meal) => meal.id)).size).toBe(2);
});

it("retains the same meal identifier and draft after a failed save so retry cannot create another copy", async () => {
  let attemptedId = "";
  store.change.mockImplementationOnce(async (fn: (draft: DataSet) => void) => {
    const draft = structuredClone(data());
    fn(draft);
    attemptedId = draft.meals[0].id;
    return false;
  });
  await component.save();
  expect(component.showForm()).toBe(true);
  expect(component.saving()).toBe(false);
  expect(component.name).toBe("Pasto da salvare");
  await component.save();
  expect(data().meals.map((meal) => meal.id)).toEqual([attemptedId]);
});

it("ignores an old photo compression after a new draft or later photo selection", async () => {
  const first = deferred<Blob>(),
    second = deferred<Blob>();
  vi.spyOn(images, "compressPhoto")
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise);
  const file = new Blob(["file"], { type: "image/jpeg" });
  const event = () =>
    ({ target: { files: [file], value: "photo.jpg" } }) as unknown as Event;
  const oldPhoto = component.takePhoto(event());
  component.closeForm();
  component.openNew();
  const currentPhoto = component.takePhoto(event()),
    photo = new Blob(["new photo"], { type: "image/jpeg" });
  second.resolve(photo);
  await currentPhoto;
  expect(component.photo).toBe(photo);
  expect(component.photoBusy()).toBe(false);
  first.resolve(new Blob(["old photo"], { type: "image/jpeg" }));
  await oldPhoto;
  expect(component.photo).toBe(photo);
  expect(component.photoBusy()).toBe(false);
});

it("does not apply late AI suggestions after its photo is removed", async () => {
  const pending = deferred<{ label: string; probability: number }[]>();
  ai.run.mockReturnValue(pending.promise);
  component.photo = new Blob(["photo"]);
  const recognizing = component.recognize();
  component.removePhoto();
  pending.resolve([{ label: "banana", probability: 0.9 }]);
  await recognizing;
  expect(component.photo).toBeUndefined();
  expect(component.suggestions()).toEqual([]);
  expect(component.error()).toBe("");
});

it("starts recognition automatically after acquiring a photo without a preparation step or changing entered values", async () => {
  const photo = new Blob(["compressed"], { type: "image/jpeg" });
  vi.spyOn(images, "compressPhoto").mockResolvedValue(photo);
  ai.run.mockResolvedValue([{ label: "banana", probability: 0.9 }]);
  const input = {
    files: [new Blob(["file"], { type: "image/jpeg" })],
    value: "meal.jpg",
  };
  await component.takePhoto({ target: input } as unknown as Event);
  expect(input.value).toBe("");
  expect(ai.run).toHaveBeenCalledExactlyOnceWith(photo, true);
  expect(component.analysisState()).toBe("done");
  expect(component.suggestions().map((food) => food.id)).toEqual(["banana"]);
  expect(component.name).toBe("Pasto da salvare");
  expect(component.calories).toBe(250);
  expect(store.change).not.toHaveBeenCalled();
});

it("keeps a failed analysis retryable and preserves its photo and meal draft", async () => {
  const photo = new Blob(["photo"]);
  component.photo = photo;
  ai.run.mockRejectedValueOnce(
    Error("Modello non disponibile: collegati e riprova."),
  );
  await component.recognize();
  expect(component.analysisState()).toBe("error");
  expect(component.analysisMessage()).toContain("collegati e riprova");
  expect(component.photo).toBe(photo);
  expect(component.name).toBe("Pasto da salvare");
  component.error.set("");
  expect(component.analysisMessage()).toContain("collegati e riprova");
  ai.run.mockResolvedValueOnce([{ label: "banana", probability: 0.9 }]);
  await component.recognize();
  expect(component.analysisState()).toBe("done");
  expect(component.error()).toBe("");
});

it("cancels analysis without discarding the photo or accepting a late failure from the cancelled request", async () => {
  let reject!: (reason: Error) => void;
  const pending = new Promise<never>((_, fail) => {
    reject = fail;
  });
  const photo = new Blob(["photo"]);
  component.photo = photo;
  ai.run.mockReturnValue(pending);
  const recognizing = component.recognize();
  expect(component.analysisState()).toBe("running");
  component.cancelAnalysis();
  reject(Error("Prova annullata."));
  await recognizing;
  expect(component.analysisState()).toBe("cancelled");
  expect(component.error()).toBe("");
  expect(component.photo).toBe(photo);
  expect(component.name).toBe("Pasto da salvare");
  expect(component.suggestions()).toEqual([]);
});

it("explains an unrecognized photo without treating a completed analysis as a loading failure", async () => {
  component.photo = new Blob(["photo"]);
  ai.run.mockResolvedValue([{ label: "plate", probability: 0.9 }]);
  await component.recognize();
  expect(component.analysisState()).toBe("unrecognized");
  expect(component.analysisMessage()).toContain("sufficiente sicurezza");
  expect(component.error()).toBe("");
  expect(component.suggestions()).toEqual([]);
});
