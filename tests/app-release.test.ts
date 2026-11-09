import "@angular/compiler";
import { createEnvironmentInjector, EnvironmentInjector } from "@angular/core";
import { SwUpdate } from "@angular/service-worker";
import { Subject } from "rxjs";
import { afterEach, expect, it, vi } from "vitest";
import {
  AppActivationUncertainError,
  AppReleaseService,
} from "../src/app/services/app-release";
const current = "a".repeat(64),
  next = "b".repeat(64),
  other = "c".repeat(64);
let injector: EnvironmentInjector | undefined;
afterEach(() => {
  injector?.destroy();
  injector = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function setup(
  options: {
    current?: string;
    running?: string;
    requested?: string | null;
    downloaded?: string;
    denyPost?: boolean;
    offline?: boolean;
  } = {},
) {
  const windowTarget = new EventTarget(),
    documentTarget = Object.assign(new EventTarget(), {
      visibilityState: "visible",
    });
  vi.stubGlobal("window", windowTarget);
  vi.stubGlobal("document", documentTarget);
  vi.stubGlobal("navigator", { onLine: !options.offline });
  const events = new Subject<any>();
  const local = options.current || current,
    target = options.downloaded || next;
  const sw = {
    isEnabled: true,
    versionUpdates: events,
    checkForUpdate: vi.fn(async () => {
      events.next({
        type: "VERSION_READY",
        currentVersion: {
          hash: "old",
          appData: { buildId: options.running || local },
        },
        latestVersion: { hash: "new", appData: { buildId: target } },
      });
      return target !== local;
    }),
    activateUpdate: vi.fn().mockResolvedValue(true),
  };
  const policy = {
    buildId: next,
    requestedBuildId:
      options.requested === undefined ? next : options.requested,
    generation: 1,
    requestedAt: 1234,
  };
  const fetch = vi.fn(async (path: string, init?: RequestInit) => {
    if (path === "/app-build.json") return Response.json({ buildId: local });
    if (
      path === "/api/app-release" &&
      init?.method === "POST" &&
      options.denyPost
    )
      return Response.json(
        { error: "Solo il Super Admin può distribuire un aggiornamento." },
        { status: 403 },
      );
    return Response.json(policy);
  });
  vi.stubGlobal("fetch", fetch);
  injector = createEnvironmentInjector(
    [{ provide: SwUpdate, useValue: sw }, AppReleaseService],
    null as unknown as EnvironmentInjector,
  );
  return {
    service: injector.get(AppReleaseService),
    sw,
    events,
    fetch,
    windowTarget,
    documentTarget,
    policy,
  };
}
it("checks on startup and accepts a requested version only after matching service-worker metadata is downloaded", async () => {
  const t = setup();
  await t.service.check();
  expect(t.service.currentBuild()).toBe(current);
  expect(t.service.downloadedBuild()).toBe(next);
  expect(t.service.autoUpdateReady()).toBe(true);
  expect(t.sw.checkForUpdate).toHaveBeenCalledOnce();
  expect(await t.service.activateReady(next)).toBe(true);
  expect(t.sw.activateUpdate).toHaveBeenCalledOnce();
});
it("does not auto-apply a different requested build or accept a caller-selected activation target", async () => {
  const t = setup({ requested: other });
  await t.service.check();
  expect(t.service.updateReady()).toBe(true);
  expect(t.service.autoUpdateReady()).toBe(false);
  await expect(t.service.activateReady(other)).rejects.toThrow(
    "non corrisponde",
  );
  expect(t.sw.activateUpdate).not.toHaveBeenCalled();
});
it("does not loop when the current build already matches the distributed version", async () => {
  const t = setup({ current: next, downloaded: next });
  await t.service.check();
  await t.service.check();
  expect(t.service.updateReady()).toBe(false);
  expect(t.service.autoUpdateReady()).toBe(false);
  expect(await t.service.activateReady()).toBe(false);
  expect(t.sw.activateUpdate).not.toHaveBeenCalled();
});
it("keeps first-use offline usable and retries when online returns", async () => {
  const t = setup({ offline: true });
  await t.service.check();
  expect(t.fetch).not.toHaveBeenCalled();
  expect(t.service.message()).toContain("connessione");
  vi.stubGlobal("navigator", { onLine: true });
  t.windowTarget.dispatchEvent(new Event("online"));
  await t.service.check();
  expect(t.service.autoUpdateReady()).toBe(true);
  expect(t.sw.checkForUpdate).toHaveBeenCalledOnce();
});
it("does not trust invalid build metadata or unauthorized distribution responses", async () => {
  const t = setup({ denyPost: true, downloaded: "untrusted-build" });
  await t.service.check();
  expect(t.service.updateReady()).toBe(false);
  expect(t.service.autoUpdateReady()).toBe(false);
  expect(await t.service.distribute()).toBe(false);
  expect(t.service.error()).toContain("Super Admin");
  expect(t.sw.activateUpdate).not.toHaveBeenCalled();
});
it("recognizes an already-cached latest version from a no-new-version event", async () => {
  const t = setup();
  t.sw.checkForUpdate.mockImplementationOnce(async () => {
    t.events.next({
      type: "NO_NEW_VERSION_DETECTED",
      version: { hash: "already-installed", appData: { buildId: next } },
    });
    return false;
  });
  await t.service.check();
  expect(t.service.autoUpdateReady()).toBe(true);
  expect(await t.service.activateReady(next)).toBe(true);
});
it("trusts the actual service-worker client version when a descriptor came from a newer network build", async () => {
  const t = setup({ current: next, running: current, downloaded: next });
  await t.service.check();
  expect(t.service.currentBuild()).toBe(current);
  expect(t.service.autoUpdateReady()).toBe(true);
  expect(await t.service.activateReady(next)).toBe(true);
});
it("marks a timed-out non-cancelable activation as requiring a coherent full reload", async () => {
  vi.useFakeTimers();
  const t = setup();
  await t.service.check();
  let finish!: (value: boolean) => void;
  t.sw.activateUpdate.mockReturnValue(
    new Promise<boolean>((resolve) => (finish = resolve)),
  );
  const task = t.service.activateReady(next),
    rejected = expect(task).rejects.toBeInstanceOf(AppActivationUncertainError);
  try {
    await vi.advanceTimersByTimeAsync(10000);
    await rejected;
    finish(true);
    await Promise.resolve();
  } finally {
    vi.useRealTimers();
  }
});
it("still requires reload when the worker reports the client was already assigned to the new version", async () => {
  const t = setup();
  await t.service.check();
  t.sw.activateUpdate.mockResolvedValue(false);
  expect(await t.service.activateReady(next)).toBe(true);
  expect(t.sw.activateUpdate).toHaveBeenCalledOnce();
});

it("does not invent an update date when checking the same version repeatedly", async () => {
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) || null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });
  const t = setup({ current: next, downloaded: next });
  await t.service.check();
  expect(t.service.lastApplied()).toBeNull();
  await t.service.check();
  expect(t.service.lastApplied()).toBeNull();
  expect(t.service.lastChecked()).toBeGreaterThan(0);
});
it("records the running worker version after a previously observed different version", async () => {
  const storage = new Map([
    [
      "gymtrack-version-receipt",
      JSON.stringify({ buildId: current, appliedAt: null }),
    ],
  ]);
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) || null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });
  const t = setup({ current: next, downloaded: next });
  await t.service.check();
  expect(t.service.lastApplied()).toBeGreaterThan(0);
  const applied = t.service.lastApplied();
  await t.service.check();
  expect(t.service.lastApplied()).toBe(applied);
});
