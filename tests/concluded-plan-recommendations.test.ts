import "@angular/compiler";
import {
  createEnvironmentInjector,
  EnvironmentInjector,
  computed,
  runInInjectionContext,
  signal,
} from "@angular/core";
import { Router } from "@angular/router";
import { expect, it, vi } from "vitest";
import { seed } from "../src/app/core/seed";
import { calendarActivity } from "../src/app/services/calendar";
import { HomeComponent } from "../src/app/features/home.component";
import { Store } from "../src/app/services/store";
import { TodayService } from "../src/app/services/today";
function fixture() {
  const d = seed(),
    at = "2026-11-02T12:00:00.000Z";
  d.plans.push(
    {
      id: "closed",
      userId: "local",
      name: "Concluso",
      description: "",
      createdAt: at,
      updatedAt: at,
      active: false,
      archived: true,
      completedAt: at,
    },
    {
      id: "live",
      userId: "local",
      name: "Attivo",
      description: "",
      createdAt: at,
      updatedAt: at,
      active: true,
      archived: false,
    },
  );
  d.days.push({ id: "closed-day", planId: "closed", name: "Giorno", order: 0 });
  d.scheduledWorkouts.push(
    {
      id: "old",
      date: "2026-11-02",
      planId: "closed",
      dayId: "closed-day",
      planName: "Concluso",
      dayName: "Non svolto",
      notes: "",
    },
    {
      id: "live",
      date: "2026-11-03",
      planId: "live",
      dayId: "live-day",
      planName: "Attivo",
      dayName: "Da fare",
      notes: "",
    },
  );
  d.workouts.push({
    id: "done",
    userId: "local",
    planId: "closed",
    dayId: "closed-day",
    planName: "Concluso",
    dayName: "Svolto",
    date: "2026-11-01",
    startedAt: at,
    endedAt: at,
    duration: 30,
    status: "completed",
    notes: "",
  });
  return d;
}
it("keeps retained missed events but excludes them from planned activity after their plan closes", () => {
  const d = fixture(),
    before = JSON.stringify(d),
    activity = calendarActivity(d);
  expect(activity.get("2026-11-02")?.planned || 0).toBe(0);
  expect(activity.get("2026-11-03")?.planned).toBe(1);
  expect(activity.get("2026-11-01")?.completed).toBe(1);
  expect(JSON.stringify(d)).toBe(before);
});
it("does not recommend or start retained events from a concluded plan on Home", async () => {
  const d = fixture(),
    data = signal(d),
    start = vi.fn(),
    startScheduled = vi.fn(),
    navigateByUrl = vi.fn();
  const store = {
    data,
    completed: computed(() =>
      data().workouts.filter((w) => w.status === "completed"),
    ),
    settings: () => data().settings[0],
    profile: () => data().profiles[0],
    nextDay: () => data().days[0],
    start,
    startScheduled,
  };
  const injector = createEnvironmentInjector(
    [
      { provide: Store, useValue: store },
      { provide: TodayService, useValue: { date: () => "2026-11-02" } },
      { provide: Router, useValue: { navigateByUrl, navigate: vi.fn() } },
    ],
    null as unknown as EnvironmentInjector,
  );
  try {
    const c = runInInjectionContext(injector, () => new HomeComponent());
    expect(c.nextScheduled()?.id).toBe("live");
    expect(c.planned("2026-11-02")).toBe(false);
    expect(c.nextDay()).toBeUndefined();
    await c.startEvent("old");
    await c.start("closed-day");
    expect(start).not.toHaveBeenCalled();
    expect(startScheduled).not.toHaveBeenCalled();
    expect(navigateByUrl).toHaveBeenCalledWith("/piano/closed");
  } finally {
    injector.destroy();
  }
});
