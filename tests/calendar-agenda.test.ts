import { expect, it } from "vitest";
import { seed } from "../src/app/core/seed";
import { ScheduledWorkout, WorkoutLog } from "../src/app/models/domain";
import {
  calendarAgenda,
  calendarAgendaByDate,
  calendarAgendaStats,
  calendarKindIcon,
  calendarKindLabel,
  calendarStatusLabel,
  formatCalendarDuration,
} from "../src/app/services/calendar-agenda";

const date = "2026-10-30";
function event(
  id: string,
  options: Partial<ScheduledWorkout> = {},
): ScheduledWorkout {
  return {
    id,
    date,
    planId: "p",
    dayId: "day",
    planName: "Piano precedente",
    dayName: "Parte alta",
    notes: "",
    ...options,
  };
}
function workout(id: string, options: Partial<WorkoutLog> = {}): WorkoutLog {
  return {
    id,
    userId: "local",
    planId: "p",
    dayId: "day",
    planName: "Piano registrato",
    dayName: "Seduta registrata",
    date,
    startedAt: date + "T11:30:00",
    duration: 0,
    notes: "",
    status: "completed",
    ...options,
  };
}

it("shows a linked log once on its recorded date with its historical names, duration and all notes", () => {
  const data = seed();
  data.scheduledWorkouts.push(
    event("scheduled", {
      date: "2026-10-29",
      workoutId: "logged",
      time: "08:00",
      durationMinutes: 45,
      estimatedCalories: 300,
      notes: "Nota programma",
    }),
  );
  data.workouts.push(
    workout("logged", { duration: 72, notes: "Nota allenamento" }),
  );
  const original = JSON.stringify(data);
  expect(calendarAgenda(data, "2026-10-29")).toEqual([]);
  const items = calendarAgenda(data, date);
  expect(items).toHaveLength(1);
  expect(items[0]).toMatchObject({
    id: "event:scheduled",
    date,
    title: "Seduta registrata",
    planName: "Piano registrato",
    time: "08:00",
    durationMinutes: 72,
    durationEstimated: false,
    estimatedCalories: 300,
    status: "completed",
    notes: "Nota programma\n\nNota allenamento",
  });
  expect(JSON.stringify(data)).toBe(original);
});

it("uses a deterministic matching-date link when an older archive contains multiple links to one workout", () => {
  const data = seed();
  data.workouts.push(workout("w"));
  data.scheduledWorkouts.push(
    event("z", { date: "2026-10-29", workoutId: "w" }),
    event("b", { workoutId: "w" }),
    event("a", { workoutId: "w" }),
  );
  expect(calendarAgenda(data, date).map((item) => item.id)).toEqual([
    "event:a",
  ]);
  data.scheduledWorkouts.reverse();
  expect(calendarAgenda(data, date).map((item) => item.id)).toEqual([
    "event:a",
  ]);
  expect(calendarAgenda(data, "2026-10-29")).toEqual([]);
});

it("builds one shared date index with scheduled entries and actual workout ownership across months", () => {
  const data = seed();
  data.workouts.push(workout("w", { date: "2026-11-01" }));
  data.scheduledWorkouts.push(
    event("old-date", { workoutId: "w" }),
    event("morning", { time: "08:00" }),
    event("later", { time: "17:00" }),
  );
  const byDate = calendarAgendaByDate(data);
  expect([...byDate.keys()].sort()).toEqual([date, "2026-11-01"]);
  expect(byDate.get(date)?.map((item) => item.id)).toEqual([
    "event:morning",
    "event:later",
  ]);
  expect(byDate.get("2026-11-01")?.map((item) => item.id)).toEqual([
    "event:old-date",
  ]);
  expect([...byDate.values()].flat()).toHaveLength(3);
});

it("includes linked and unlinked open logs once with real set progress and deduplicated notes", () => {
  const data = seed();
  data.workouts.push(
    workout("linked", { status: "draft", notes: "Indicazione" }),
    workout("unlinked", { status: "draft" }),
  );
  data.scheduledWorkouts.push(
    event("e", { workoutId: "linked", notes: " Indicazione " }),
  );
  data.workoutExercises.push({
    id: "we",
    workoutId: "linked",
    exerciseId: "exercise-0",
    name: "Panca",
    loadMode: "external",
    order: 0,
    rest: 90,
    notes: "",
  });
  data.sets.push(
    {
      id: "s1",
      workoutExerciseId: "we",
      number: 1,
      weight: 20,
      reps: 8,
      completed: true,
    },
    {
      id: "s2",
      workoutExerciseId: "we",
      number: 2,
      weight: 20,
      reps: 8,
      completed: false,
    },
    {
      id: "s3",
      workoutExerciseId: "we",
      number: 3,
      weight: 10,
      reps: 8,
      kind: "warmup",
      completed: true,
    },
  );
  const items = calendarAgenda(data, date);
  expect(items).toHaveLength(2);
  expect(items.find((item) => item.id === "event:e")).toMatchObject({
    status: "partial",
    completedSets: 2,
    totalSets: 3,
    notes: "Indicazione",
  });
  expect(items.find((item) => item.id === "workout:unlinked")).toMatchObject({
    status: "partial",
    completedSets: 0,
    totalSets: 0,
  });
  expect(calendarAgendaStats(items)).toMatchObject({
    total: 2,
    partial: 2,
    completed: 0,
    completionPercent: 0,
  });
});

it("sorts optional times and never infers an hour from the later insertion of a past workout", () => {
  const data = seed();
  data.scheduledWorkouts.push(
    event("late", { time: "17:00" }),
    event("untimed"),
    event("early-b", { time: "08:00" }),
    event("early-a", { time: "08:00" }),
  );
  data.workouts.push(
    workout("past", { startedAt: "2026-11-01T18:00:00" }),
    workout("actual", { startedAt: date + "T09:15:00" }),
  );
  const items = calendarAgenda(data, date);
  expect(items.map((item) => item.id)).toEqual([
    "event:early-a",
    "event:early-b",
    "workout:actual",
    "event:late",
    "event:untimed",
    "workout:past",
  ]);
  expect(
    items.find((item) => item.id === "workout:past")?.time,
  ).toBeUndefined();
  expect(items.find((item) => item.id === "workout:actual")?.time).toBe(
    "09:15",
  );
});

it("keeps planned sets visible after scheduling and treats orphaned links as a retained programme", () => {
  const data = seed();
  data.planExercises.push({
    id: "pe",
    dayId: "day",
    exerciseId: "exercise-0",
    sets: 3,
    warmupSets: 1,
    repsMin: 8,
    repsMax: 10,
    rest: 90,
    notes: "",
    order: 0,
  });
  data.scheduledWorkouts.push(
    event("programme", { workoutId: "missing-log", durationMinutes: 50 }),
  );
  expect(calendarAgenda(data, date)[0]).toMatchObject({
    status: "planned",
    completedSets: 0,
    totalSets: 4,
    durationMinutes: 50,
    durationEstimated: true,
  });
});

it("separates rest and missed programmes from completion targets and sums only explicit activity estimates", () => {
  const data = seed();
  data.plans.push({
    id: "ended",
    userId: "local",
    name: "Concluso",
    description: "",
    createdAt: date,
    updatedAt: date,
    active: false,
    archived: true,
    completedAt: date,
  });
  data.scheduledWorkouts.push(
    event("cardio", {
      kind: "cardio",
      planId: "",
      dayId: "",
      planName: "",
      done: true,
      durationMinutes: 20,
      estimatedCalories: 150,
    }),
    event("mobility", {
      kind: "mobility",
      planId: "",
      dayId: "",
      planName: "",
      durationMinutes: 15,
      estimatedCalories: 0,
    }),
    event("rest", {
      kind: "rest",
      planId: "",
      dayId: "",
      planName: "",
      durationMinutes: 90,
      estimatedCalories: 999,
    }),
    event("note", { kind: "other", planId: "", dayId: "", planName: "" }),
    event("missed", {
      planId: "ended",
      durationMinutes: 100,
      estimatedCalories: 1000,
    }),
  );
  data.meals.push({
    id: "meal",
    date,
    name: "Pranzo",
    grams: 100,
    calories: 450,
    protein: 10,
    carbs: 20,
    fat: 30,
    notes: "",
    source: "manual",
    createdAt: date,
  });
  const items = calendarAgenda(data, date);
  expect(items.find((item) => item.id === "event:rest")?.status).toBe("rest");
  expect(items.find((item) => item.id === "event:note")?.status).toBe("other");
  expect(items.find((item) => item.id === "event:missed")?.status).toBe(
    "missed",
  );
  expect(calendarAgendaStats(items)).toEqual({
    total: 3,
    completed: 1,
    partial: 0,
    planned: 2,
    rest: 1,
    completionPercent: 33,
    durationMinutes: 35,
    hasDuration: true,
    hasEstimatedDuration: true,
    estimatedCalories: 150,
    hasCalories: true,
  });
});

it("distinguishes a known zero calorie estimate from unavailable energy and duration values", () => {
  const data = seed();
  data.scheduledWorkouts.push(event("empty"));
  expect(calendarAgendaStats(calendarAgenda(data, date))).toMatchObject({
    hasCalories: false,
    estimatedCalories: 0,
    hasDuration: false,
    durationMinutes: 0,
  });
  data.scheduledWorkouts[0].estimatedCalories = 0;
  expect(calendarAgendaStats(calendarAgenda(data, date))).toMatchObject({
    hasCalories: true,
    estimatedCalories: 0,
    hasDuration: false,
  });
  expect(calendarAgendaStats([])).toMatchObject({
    total: 0,
    completed: 0,
    completionPercent: 0,
    hasCalories: false,
    hasDuration: false,
  });
});

it("uses a planned duration when a historical workout has no duration without pretending it is recorded", () => {
  const data = seed();
  data.scheduledWorkouts.push(
    event("e", { workoutId: "w", durationMinutes: 40 }),
  );
  data.workouts.push(workout("w", { duration: 0, durationUnknown: true }));
  const item = calendarAgenda(data, date)[0];
  expect(item).toMatchObject({ durationMinutes: 40, durationEstimated: true });
  expect(calendarAgendaStats([item])).toMatchObject({
    durationMinutes: 40,
    hasDuration: true,
    hasEstimatedDuration: true,
  });
});

it("provides concise type, status and duration labels without fixed sample values", () => {
  expect(calendarKindLabel("mobility")).toBe("Mobilità");
  expect(calendarKindLabel("rest")).toBe("Riposo");
  expect(calendarKindIcon("workout")).toBe("weight");
  expect(calendarKindIcon("rest")).toBe("moon");
  expect(calendarStatusLabel("partial")).toBe("In corso");
  expect(calendarStatusLabel("missed")).toBe("Non svolto");
  expect(formatCalendarDuration(80)).toBe("1 h 20 min");
  expect(formatCalendarDuration(60)).toBe("1 h");
  expect(formatCalendarDuration(45)).toBe("45 min");
  expect(formatCalendarDuration(0.5)).toBe("<1 min");
  expect(formatCalendarDuration(0)).toBe("—");
  expect(formatCalendarDuration(NaN)).toBe("—");
});
