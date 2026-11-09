import "@angular/compiler";
import "fake-indexeddb/auto";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { createEnvironmentInjector, EnvironmentInjector } from "@angular/core";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import {
  pushDeviceGrant,
  stopDevicePushForLogout,
} from "../src/app/services/push-device";
import { PushReminderService } from "../src/app/services/push-reminder";
import { AuthService } from "../src/app/services/auth";
import { Store } from "../src/app/services/store";
import { ArchiveSyncService } from "../src/app/services/archive-sync";
const id = "a".repeat(64);
beforeEach(async () => {
  await pushDeviceGrant({ accountId: "u", id, enabled: false });
});
afterEach(() => vi.unstubAllGlobals());
function worker() {
  const handlers: any = {},
    notification = vi.fn().mockResolvedValue(undefined),
    badge = vi.fn().mockResolvedValue(undefined),
    clearBadge = vi.fn().mockResolvedValue(undefined),
    focus = vi.fn().mockResolvedValue(undefined),
    open = vi.fn().mockResolvedValue(undefined);
  const getNotifications = vi.fn().mockResolvedValue([]);
  const self = {
    registration: { showNotification: notification, getNotifications },
    navigator: { setAppBadge: badge, clearAppBadge: clearBadge },
    location: { origin: "https://gymtrack.test" },
    clients: {
      matchAll: async () => [{ url: "https://gymtrack.test/sessione", focus }],
      openWindow: open,
    },
    addEventListener: (type: string, handler: any) =>
      (handlers[type] = handler),
  };
  vm.runInNewContext(readFileSync("public/gymtrack-app-worker-v3.js", "utf8"), {
    self,
    indexedDB,
    URL,
    importScripts: vi.fn(),
  });
  return {
    handlers,
    notification,
    getNotifications,
    badge,
    clearBadge,
    focus,
    open,
  };
}
async function push(w: ReturnType<typeof worker>, data: any = null) {
  let job = Promise.resolve();
  w.handlers.push({ data, waitUntil: (p: Promise<void>) => (job = p) });
  await job;
}
it("removes only retired recovery alerts on upgrade and keeps workout reminders available", async () => {
  const w = worker(),
    rest = { tag: "gymtrack-rest-timer", close: vi.fn() },
    reminder = { tag: "gymtrack-daily-workout", close: vi.fn() };
  w.getNotifications.mockResolvedValue([rest, reminder]);
  let job = Promise.resolve();
  w.handlers.activate({ waitUntil: (p: Promise<void>) => (job = p) });
  await job;
  expect(w.getNotifications).toHaveBeenCalledWith({
    tag: "gymtrack-rest-timer",
  });
  expect(rest.close).toHaveBeenCalledOnce();
  expect(reminder.close).not.toHaveBeenCalled();
  expect(w.clearBadge).not.toHaveBeenCalled();
  await pushDeviceGrant({ accountId: "u", id, enabled: true });
  await push(w);
  expect(w.notification).toHaveBeenCalledOnce();
  expect(w.notification.mock.calls[0][1].tag).toBe("gymtrack-daily-workout");
});
it("shows a generic background reminder and badge only after device opt-in", async () => {
  const w = worker();
  await push(w);
  expect(w.notification).not.toHaveBeenCalled();
  await pushDeviceGrant({ accountId: "u", id, enabled: true });
  await push(w);
  expect(w.notification).toHaveBeenCalledOnce();
  expect(w.badge).toHaveBeenCalledWith(1);
  expect(w.notification.mock.calls[0][1].tag).toBe("gymtrack-daily-workout");
});
it("leaves structured Angular push notifications to the existing worker handler", async () => {
  const w = worker();
  await pushDeviceGrant({ accountId: "u", id, enabled: true });
  await push(w, { json: () => ({ notification: { title: "Other" } }) });
  expect(w.notification).not.toHaveBeenCalled();
});
it("focuses the existing app without navigating away from an active workout on a notification click", async () => {
  const w = worker();
  let job = Promise.resolve();
  const stop = vi.fn();
  w.handlers.notificationclick({
    notification: { data: { gymtrackWorkoutReminder: true }, close: vi.fn() },
    stopImmediatePropagation: stop,
    waitUntil: (p: Promise<void>) => (job = p),
  });
  await job;
  expect(w.focus).toHaveBeenCalledOnce();
  expect(w.open).not.toHaveBeenCalled();
  expect(stop).toHaveBeenCalledOnce();
});
it("disables device reminders and unsubscribes during logout without touching workout storage", async () => {
  await pushDeviceGrant({ accountId: "u", id, enabled: true });
  const unsubscribe = vi.fn().mockResolvedValue(true);
  vi.stubGlobal("navigator", {
    serviceWorker: {
      getRegistration: async () => ({
        pushManager: { getSubscription: async () => ({ unsubscribe }) },
      }),
    },
    clearAppBadge: vi.fn().mockResolvedValue(undefined),
  });
  await stopDevicePushForLogout();
  expect((await pushDeviceGrant())?.enabled).toBe(false);
  expect(unsubscribe).toHaveBeenCalledOnce();
});
it("requests iOS permission directly in the enable click before asynchronous work", async () => {
  let resolve!: (permission: string) => void;
  const permission = vi.fn(() => new Promise<string>((r) => (resolve = r)));
  vi.stubGlobal("window", { Notification: {}, PushManager: {} });
  vi.stubGlobal("Notification", { requestPermission: permission });
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  vi.stubGlobal("navigator", {
    userAgent: "iPhone",
    platform: "iPhone",
    maxTouchPoints: 1,
    serviceWorker: {},
  });
  const request = vi.fn(),
    injector = createEnvironmentInjector(
      [
        {
          provide: AuthService,
          useValue: {
            user: () => ({ id: "u" }),
            offlineMode: () => false,
            request,
          },
        },
        { provide: Store, useValue: {} },
        { provide: ArchiveSyncService, useValue: {} },
        PushReminderService,
      ],
      null as unknown as EnvironmentInjector,
    );
  try {
    const service = injector.get(PushReminderService),
      job = service.enable(
        {
          available: true,
          configured: true,
          publicKey: "a",
          deviceEnabled: false,
          time: "08:30",
          timezone: "Europe/Rome",
          everyDay: false,
        },
        { time: "08:30", timezone: "Europe/Rome", everyDay: false },
      );
    expect(permission).toHaveBeenCalledOnce();
    resolve("denied");
    await expect(job).rejects.toThrow("non consentite");
    expect(request).not.toHaveBeenCalled();
  } finally {
    injector.destroy();
  }
});

it("handles an explicitly empty push body as well as a null body", async () => {
  const w = worker();
  await pushDeviceGrant({ accountId: "u", id, enabled: true });
  await push(w, { text: () => "" });
  expect(w.notification).toHaveBeenCalledOnce();
});
