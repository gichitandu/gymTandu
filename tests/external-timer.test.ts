import "@angular/compiler";
import { afterEach, expect, it, vi } from "vitest";
import {
  ExternalTimerService,
  ExternalTimerState,
  externalTimerSeconds,
} from "../src/app/services/external-timer";
import { exportBackup, importBackup } from "../src/app/services/backup";
import { seed } from "../src/app/core/seed";

const instances: ExternalTimerService[] = [];
afterEach(() => {
  instances.forEach((service) => service.ngOnDestroy());
  instances.length = 0;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function browser(windowExtras: Record<string, unknown> = {}) {
  const listeners = new Map<string, () => void>();
  const document = {
    title: "GymTrack",
    addEventListener: (name: string, callback: () => void) =>
      listeners.set(name, callback),
    removeEventListener: (name: string) => listeners.delete(name),
    createElement: () => ({}),
  };
  vi.stubGlobal("document", document);
  vi.stubGlobal("window", { focus: vi.fn(), ...windowExtras });
  vi.stubGlobal("navigator", {});
  return { document, listeners };
}

function service() {
  const instance = new ExternalTimerService();
  instances.push(instance);
  return instance;
}

function state(seconds = 90): ExternalTimerState {
  return {
    end: Date.now() + seconds * 1000,
    paused: false,
    pausedSeconds: 0,
    title: "Panca piana",
  };
}

it("reconciles elapsed background time from the deadline and holds the paused duration", () => {
  const timer = {
    end: 100_000,
    paused: false,
    pausedSeconds: 17,
    title: "Squat",
  };
  expect(externalTimerSeconds(timer, 9_500)).toBe(91);
  expect(externalTimerSeconds(timer, 99_100)).toBe(1);
  expect(externalTimerSeconds(timer, 200_000)).toBe(0);
  expect(externalTimerSeconds({ ...timer, paused: true }, 200_000)).toBe(17);
});

it("updates the floating window from the same deadline and closes it when recovery is skipped", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-21T12:00:00Z"));
  const elements = new Map<string, { id: string; textContent?: string }>();
  const external = {
    closed: false,
    close: vi.fn(),
    focus: vi.fn(),
    addEventListener: vi.fn(),
    document: {
      title: "",
      createElement: () => ({ id: "", setAttribute: vi.fn() }),
      head: { append: vi.fn() },
      body: {
        append: (...items: { id: string }[]) =>
          items.forEach((item) => elements.set(item.id, item)),
      },
      getElementById: (id: string) => elements.get(id),
    },
  };
  const requestWindow = vi.fn().mockResolvedValue(external);
  const { listeners, document } = browser({
    documentPictureInPicture: { requestWindow },
  });
  const timer = service(),
    initial = state();
  await timer.open(initial);
  expect(timer.active()).toBe(true);
  expect(elements.get("countdown")!.textContent).toBe("01:30");
  vi.setSystemTime(initial.end - 12_000);
  listeners.get("visibilitychange")!();
  expect(elements.get("countdown")!.textContent).toBe("00:12");
  timer.sync({ ...initial, paused: true, pausedSeconds: 12 });
  vi.setSystemTime(initial.end + 100_000);
  listeners.get("visibilitychange")!();
  expect(elements.get("countdown")!.textContent).toBe("00:12");
  expect(elements.get("timer-status")!.textContent).toBe("In pausa");
  timer.stop();
  expect(external.close).toHaveBeenCalledOnce();
  expect(timer.active()).toBe(false);
  expect(document.title).toBe("GymTrack");
});

it("reports unavailable platform features without claiming the timer is externally visible", async () => {
  browser();
  const timer = service();
  await timer.open(state());
  expect(timer.active()).toBe(false);
  expect(timer.message()).toContain("Usa il timer nell’allenamento");
});

it.each([true, false])(
  "preserves the retired timer preference %s in existing backups",
  async (enabled) => {
    const data = seed();
    data.settings[0].externalTimerEnabled = enabled;
    const restored = await importBackup(await exportBackup(data));
    expect(restored.settings[0].externalTimerEnabled).toBe(enabled);
  },
);

it("does not create hidden media when only synchronizing the recovery", () => {
  const { document } = browser();
  const create = vi.spyOn(document, "createElement");
  const timer = service();
  timer.sync(state());
  timer.sync(state());
  expect(create).not.toHaveBeenCalled();
});

it.each(["default", "granted", "denied"])(
  "never requests or sends a device notification during recovery with permission %s",
  async (permission) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-27T12:00:00Z"));
    const notification = Object.assign(vi.fn(), {
      permission,
      requestPermission: vi.fn().mockResolvedValue("granted"),
    });
    const { listeners, document } = browser({ Notification: notification });
    vi.stubGlobal("Notification", notification);
    const showNotification = vi.fn(),
      getRegistration = vi.fn().mockResolvedValue({
        showNotification,
        getNotifications: vi.fn().mockResolvedValue([]),
      });
    vi.stubGlobal("navigator", { serviceWorker: { getRegistration } });
    const timer = service(),
      initial = state();
    timer.sync(initial);
    await vi.advanceTimersByTimeAsync(10000);
    timer.sync({ ...initial, paused: true, pausedSeconds: 80 });
    vi.setSystemTime(initial.end + 60000);
    listeners.get("visibilitychange")!();
    expect(document.title).toContain("01:20");
    timer.sync({ ...initial, end: Date.now() + 80000 });
    await vi.advanceTimersByTimeAsync(80000);
    expect(document.title).toContain("00:00");
    timer.stop();
    await timer.open(state(120));
    expect(notification.requestPermission).not.toHaveBeenCalled();
    expect(notification).not.toHaveBeenCalled();
    expect(showNotification).not.toHaveBeenCalled();
    expect(timer.active()).toBe(false);
  },
);
