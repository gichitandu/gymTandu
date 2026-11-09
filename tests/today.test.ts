import "@angular/compiler";
import { createEnvironmentInjector, EnvironmentInjector } from "@angular/core";
import { afterEach, expect, it, vi } from "vitest";
import { TodayService } from "../src/app/services/today";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("updates the local date at midnight and releases its timer when destroyed", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 21, 23, 59, 58));
  const document = Object.assign(new EventTarget(), {
    visibilityState: "visible",
  });
  const window = new EventTarget();
  vi.stubGlobal("document", document);
  vi.stubGlobal("window", window);
  const injector = createEnvironmentInjector(
    [TodayService],
    null as unknown as EnvironmentInjector,
  );
  const today = injector.get(TodayService);
  expect(today.date()).toBe("2026-10-21");
  await vi.advanceTimersByTimeAsync(2100);
  expect(today.date()).toBe("2026-10-22");
  injector.destroy();
  expect(vi.getTimerCount()).toBe(0);
});
it("refreshes immediately after the phone resumes on a later day", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 9, 21, 12));
  const document = Object.assign(new EventTarget(), {
    visibilityState: "visible",
  });
  const window = new EventTarget();
  vi.stubGlobal("document", document);
  vi.stubGlobal("window", window);
  const injector = createEnvironmentInjector(
    [TodayService],
    null as unknown as EnvironmentInjector,
  );
  const today = injector.get(TodayService);
  vi.setSystemTime(new Date(2026, 9, 24, 9));
  window.dispatchEvent(new Event("pageshow"));
  expect(today.date()).toBe("2026-10-24");
  injector.destroy();
});
