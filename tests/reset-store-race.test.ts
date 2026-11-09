import "@angular/compiler";
import { createEnvironmentInjector, EnvironmentInjector } from "@angular/core";
import { afterEach, expect, it, vi } from "vitest";
import { GYM_REPOSITORY } from "../src/app/repositories/repository";
import { Store } from "../src/app/services/store";
import { AuthService } from "../src/app/services/auth";
import { ArchiveSyncService } from "../src/app/services/archive-sync";
import { DataSet } from "../src/app/models/domain";
import { seed } from "../src/app/core/seed";
const injectors: EnvironmentInjector[] = [];
afterEach(() => {
  injectors.splice(0).forEach((injector) => injector.destroy());
  vi.unstubAllGlobals();
});
function setup() {
  vi.stubGlobal("document", { body: { classList: { toggle: () => {} } } });
  const local = seed(),
    at = "2026-10-01T12:00:00Z";
  local.plans.push({
    id: "old-plan",
    userId: "local",
    name: "Piano precedente",
    description: "",
    createdAt: at,
    updatedAt: at,
    active: true,
    archived: false,
  });
  let saved = structuredClone(local),
    accept!: (value: DataSet) => Promise<boolean>;
  const replace = vi.fn(async (value: DataSet) => {
    saved = structuredClone(value);
  });
  const cloud = {
    open: vi.fn(
      async (
        _key: string,
        _local: DataSet,
        _allow: boolean,
        restore: (value: DataSet) => Promise<boolean>,
      ) => {
        accept = restore;
        return _local;
      },
    ),
    changed: vi.fn(),
  };
  const injector = createEnvironmentInjector(
    [
      {
        provide: AuthService,
        useValue: {
          user: () => ({ id: "tandu", role: "SuperAdmin" }),
          offlineMode: () => true,
        },
      },
      {
        provide: GYM_REPOSITORY,
        useValue: {
          storageKey: "tandu-reset-test",
          read: async () => structuredClone(saved),
          replace,
        },
      },
      { provide: ArchiveSyncService, useValue: cloud },
      Store,
    ],
    null as unknown as EnvironmentInjector,
  );
  injectors.push(injector);
  return {
    store: injector.get(Store),
    replace,
    saved: () => saved,
    accept: (value: DataSet) => accept(value),
    cloud,
  };
}
it("latches the reset before queueing it so stale submitted and queued editor saves cannot resurrect the old plan", async () => {
  const t = setup();
  await vi.waitFor(() => expect(t.cloud.open).toHaveBeenCalledOnce());
  let release!: () => void, started!: () => void;
  const began = new Promise<void>((resolve) => (started = resolve));
  const pending = t.store.change(
    async (data) => {
      started();
      await new Promise<void>((resolve) => (release = resolve));
      data.plans[0].name = "Old editor in progress";
    },
    "",
    false,
  );
  await began;
  const queuedMutation = vi.fn((data: DataSet) => {
    data.plans[0].name = "Old queued editor";
  });
  const queued = t.store.change(queuedMutation, "", false);
  const clean = seed();
  clean.settings[0].archiveResetId = "approved-reset";
  const resetting = t.accept(clean);
  const lateMutation = vi.fn((data: DataSet) => {
    data.plans.push({ ...t.saved().plans[0], id: "resurrected" });
  });
  expect(await t.store.change(lateMutation, "", false)).toBe(false);
  expect(lateMutation).not.toHaveBeenCalled();
  release();
  expect(await pending).toBe(false);
  expect(await queued).toBe(false);
  expect(queuedMutation).not.toHaveBeenCalled();
  expect(await resetting).toBe(true);
  expect(t.replace).toHaveBeenCalledOnce();
  expect(t.saved().plans).toEqual([]);
  expect(t.saved().settings[0].archiveResetId).toBe("approved-reset");
  expect(await t.store.savePlan("late", "Must not return", "")).toBe(false);
  expect(t.saved().plans).toEqual([]);
  await t.store.init();
  expect(await t.store.savePlan("still-late", "No reset bypass", "")).toBe(
    false,
  );
});
it("allows retrying local writes only when the authoritative reset could not commit locally", async () => {
  const t = setup();
  await vi.waitFor(() => expect(t.cloud.open).toHaveBeenCalledOnce());
  t.replace.mockRejectedValueOnce(Error("Storage unavailable"));
  const clean = seed();
  clean.settings[0].archiveResetId = "approved-reset";
  expect(await t.accept(clean)).toBe(false);
  expect(t.saved().plans[0].id).toBe("old-plan");
  expect(await t.store.savePlan("retry", "Still local", "")).toBe(true);
  expect(t.saved().plans.map((plan) => plan.id)).toEqual(["old-plan", "retry"]);
});
