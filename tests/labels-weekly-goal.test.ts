import "@angular/compiler";
import {
  computed,
  createEnvironmentInjector,
  EnvironmentInjector,
  runInInjectionContext,
  signal,
} from "@angular/core";
import { Router } from "@angular/router";
import { describe, expect, it } from "vitest";
import { HomeComponent } from "../src/app/features/home.component";
import { Store } from "../src/app/services/store";
import { TodayService } from "../src/app/services/today";
import { seed } from "../src/app/core/seed";
import {
  ALL_DESIGN_PRESETS,
  DEFAULT_DESIGN,
  DESIGN_CONTROLS,
  DESIGN_PAGES,
  designContrast,
  designStyles,
  parseDesign,
  resolveDesign,
  resolveDesignLabel,
  validDesign,
} from "../shared/design-system.js";

describe("editable presentation labels", () => {
  it("publishes page names, subtitles and navigation independently without changing routes or data identities", () => {
    const config = structuredClone(DEFAULT_DESIGN),
      routes = JSON.stringify(DESIGN_PAGES);
    config.instances["home.title"] = { label: "Il mio spazio", radius: 12 };
    config.instances["home.subtitle"] = { label: "Una seduta alla volta" };
    config.instances["navigation.home"] = { label: "Inizio" };
    config.instances["training.title"] = { label: "I miei allenamenti" };
    config.instances["progress.title"] = { label: "Risultati" };
    config.instances["profile.title"] = { label: "Il mio profilo" };
    const accepted = parseDesign(config);
    expect(resolveDesignLabel(accepted, "home.title")).toBe("Il mio spazio");
    expect(resolveDesignLabel(accepted, "navigation.home", "Home")).toBe(
      "Inizio",
    );
    expect(resolveDesignLabel(accepted, "progress.title")).toBe("Risultati");
    expect(resolveDesignLabel(accepted, "home.week.title")).toBe(
      "La tua settimana",
    );
    expect(JSON.stringify(DESIGN_PAGES)).toBe(routes);
    expect(accepted.instances["home.title"].radius).toBe(12);
  });
  it("restores the exact mobile and desktop defaults, including when Studio is disabled", () => {
    const config = structuredClone(DEFAULT_DESIGN);
    expect(resolveDesignLabel(config, "navigation.training", "Allenati")).toBe(
      "Allenati",
    );
    expect(
      resolveDesignLabel(config, "navigation.training", "Allenamenti"),
    ).toBe("Allenamenti");
    config.instances["navigation.training"] = { label: "Workout" };
    expect(
      resolveDesignLabel(config, "navigation.training", "Allenamenti"),
    ).toBe("Workout");
    config.enabled = false;
    expect(
      resolveDesignLabel(config, "navigation.training", "Allenamenti"),
    ).toBe("Allenamenti");
    config.enabled = true;
    delete config.instances["navigation.training"].label;
    expect(resolveDesignLabel(config, "navigation.training", "Allenati")).toBe(
      "Allenati",
    );
    expect(resolveDesignLabel(config, "unregistered", "Calendario")).toBe(
      "Calendario",
    );
  });
  it("accepts every registered static label and preserves it through JSON export and import", () => {
    const config = structuredClone(DEFAULT_DESIGN);
    const controls = DESIGN_CONTROLS.filter((control) => control.label);
    expect(controls.length).toBeGreaterThan(40);
    for (const control of controls)
      config.instances[control.id] = {
        label: "La mia scritta · " + control.page,
      };
    expect(parseDesign(JSON.parse(JSON.stringify(config)))).toEqual(config);
    expect(
      DESIGN_CONTROLS.find((control) => control.id === "profile.logout")?.label,
    ).toBeUndefined();
  });
  it.each([
    "",
    "   ",
    "<img src=x onerror=alert(1)>",
    "x".repeat(61),
    "Nome\nscript",
  ])(
    "rejects invalid label %j at the shared client/server boundary",
    (label) => {
      const config = structuredClone(DEFAULT_DESIGN);
      config.instances["home.title"] = { label };
      expect(validDesign(config)).toBe(false);
    },
  );
});

function withHome(
  run: (
    home: HomeComponent,
    data: ReturnType<typeof signal<ReturnType<typeof seed>>>,
    today: ReturnType<typeof signal<string>>,
  ) => void,
) {
  const data = signal(seed()),
    today = signal("2026-11-04");
  const store = {
    data,
    settings: computed(() => data().settings[0]),
    profile: () => data().profiles[0],
    completed: computed(() =>
      data().workouts.filter((workout) => workout.status === "completed"),
    ),
    nextDay: () => undefined,
  };
  const injector = createEnvironmentInjector(
    [
      { provide: Store, useValue: store },
      { provide: TodayService, useValue: { date: today } },
      { provide: Router, useValue: {} },
    ],
    null as unknown as EnvironmentInjector,
  );
  try {
    run(
      runInInjectionContext(injector, () => new HomeComponent()),
      data,
      today,
    );
  } finally {
    injector.destroy();
  }
}
function workout(
  id: string,
  date: string,
  status: "completed" | "draft" = "completed",
) {
  return {
    id,
    date,
    status,
    userId: "local",
    planId: "p",
    dayId: "d",
    planName: "Piano",
    dayName: "Seduta",
    startedAt: date + "T12:00:00",
    duration: 30,
    notes: "",
  };
}
describe("restored weekly completion percentage", () => {
  it("keeps the numeric ring readable across all twenty presets and an isolated fill override", () => {
    const config = structuredClone(DEFAULT_DESIGN);
    for (const preset of ALL_DESIGN_PRESETS) {
      config.presetId = preset.id;
      const styles = designStyles(
        resolveDesign(config, "home", "home.goals"),
        "progress",
      );
      expect(
        designContrast(
          styles["--design-progress-ink"],
          styles["--design-progress-surface"],
        ),
      ).toBeGreaterThanOrEqual(4.5);
    }
    const styles = designStyles(
      { fill: "#00D9FF", text: "#FFFFFF" },
      "progress",
    );
    expect(
      designContrast(styles["--design-progress-ink"], "#00D9FF"),
    ).toBeGreaterThanOrEqual(4.5);
  });
  it("counts completed sessions from Monday to Sunday against the saved personal goal", () =>
    withHome((home, data) => {
      data.update((value) => ({
        ...value,
        settings: [{ ...value.settings[0], goals: { workoutsPerWeek: 3 } }],
        workouts: [
          workout("monday", "2026-11-02"),
          workout("today", "2026-11-04"),
          workout("old", "2026-11-01"),
          workout("next", "2026-11-09"),
          workout("draft", "2026-11-03", "draft"),
        ],
      }));
      expect(home.weekCount()).toBe(2);
      expect(home.weeklyProgress()).toBe(67);
      data.update((value) => ({
        ...value,
        workouts: [...value.workouts, workout("sunday", "2026-11-08")],
      }));
      expect(home.weekCount()).toBe(3);
      expect(home.weeklyProgress()).toBe(100);
    }));
  it("keeps the real completed count and caps the displayed progress at 100 percent", () =>
    withHome((home, data) => {
      data.update((value) => ({
        ...value,
        settings: [{ ...value.settings[0], goals: { workoutsPerWeek: 1 } }],
        workouts: [workout("a", "2026-11-04"), workout("b", "2026-11-04")],
      }));
      expect(home.weekCount()).toBe(2);
      expect(home.weeklyProgress()).toBe(100);
      data.update((value) => ({
        ...value,
        settings: [{ ...value.settings[0], goals: { workoutsPerWeek: 4 } }],
      }));
      expect(home.weeklyProgress()).toBe(50);
    }));
  it("does not invent a goal when none was saved, or count calendar-only activities", () =>
    withHome((home, data) => {
      data.update((value) => ({
        ...value,
        scheduledWorkouts: [
          {
            id: "rest",
            kind: "rest",
            date: "2026-11-04",
            planId: "",
            dayId: "",
            planName: "",
            dayName: "Riposo",
            notes: "",
          },
        ],
        workouts: [workout("a", "2026-11-04")],
      }));
      expect(home.goals()?.workoutsPerWeek).toBeUndefined();
      expect(home.weekCount()).toBe(1);
      expect(home.weeklyProgress()).toBe(0);
      expect(home.planned("2026-11-04")).toBe(false);
    }));
  it("refreshes the reporting week when the local date moves from Sunday to Monday", () =>
    withHome((home, data, today) => {
      data.update((value) => ({
        ...value,
        settings: [{ ...value.settings[0], goals: { workoutsPerWeek: 2 } }],
        workouts: [workout("last", "2026-11-08")],
      }));
      today.set("2026-11-08");
      expect(home.weeklyProgress()).toBe(50);
      today.set("2026-11-09");
      expect(home.weekCount()).toBe(0);
      expect(home.weeklyProgress()).toBe(0);
      expect(home.week[0].date).toBe("2026-11-09");
    }));
  it("writes the Home headline and streak from real completed days and calendar rest days", () =>
    withHome((home, data) => {
      expect(home.headline()).toBe("pronto a partire?");
      data.update((value) => ({
        ...value,
        settings: [{ ...value.settings[0], goals: { workoutsPerWeek: 3 } }],
        workouts: [workout("a", "2026-11-04"), workout("b", "2026-11-02")],
      }));
      expect(home.goalRemaining()).toBe(1);
      expect(home.headline()).toBe("sei a un passo.");
      expect(home.streak()).toBe(1);
      data.update((value) => ({
        ...value,
        scheduledWorkouts: [
          {
            id: "rest",
            kind: "rest",
            date: "2026-11-03",
            planId: "",
            dayId: "",
            planName: "",
            dayName: "Riposo",
            notes: "",
          },
        ],
      }));
      expect(home.streak()).toBe(3);
      data.update((value) => ({
        ...value,
        workouts: [...value.workouts, workout("c", "2026-11-05")],
      }));
      expect(home.headline()).toBe("obiettivo raggiunto.");
      expect(home.weekMinutes()).toBe(90);
      data.update((value) => ({
        ...value,
        settings: [{ ...value.settings[0], goals: { workoutsPerWeek: 6 } }],
      }));
      expect(home.headline()).toBe("ancora 3 allenamenti.");
    }));
  it("classifies each weekday bar and builds an eight-week trend line", () =>
    withHome((home, data) => {
      data.update((value) => ({
        ...value,
        workouts: [workout("a", "2026-11-02"), workout("b", "2026-10-20")],
        scheduledWorkouts: [
          {
            id: "rest",
            kind: "rest",
            date: "2026-11-03",
            planId: "",
            dayId: "",
            planName: "",
            dayName: "Riposo",
            notes: "",
          },
          {
            id: "cardio",
            kind: "cardio",
            date: "2026-11-05",
            planId: "",
            dayId: "",
            planName: "",
            dayName: "Corsa",
            notes: "",
          },
          {
            id: "next",
            date: "2026-11-06",
            planId: "p",
            dayId: "d",
            planName: "Piano",
            dayName: "Seduta",
            notes: "",
          },
        ],
      }));
      expect(home.dayInfo("2026-11-02")).toEqual({ state: "done", height: 40 });
      expect(home.dayInfo("2026-11-03").state).toBe("rest");
      expect(home.dayInfo("2026-11-04").state).toBe("empty");
      expect(home.dayInfo("2026-11-05").state).toBe("cardio");
      expect(home.dayInfo("2026-11-06").state).toBe("plan");
      const trend = home.trend();
      expect(trend.total).toBe(2);
      expect(trend.line.startsWith("M4.0 ")).toBe(true);
      expect(trend.line.split("L")).toHaveLength(8);
    }));
});
