import { describe, it, expect } from "vitest";
import { seed } from "../src/app/core/seed";
import {
  summarizeTraining,
  trainingTimeline,
  trainingReportCsv,
  workoutReminderIcs,
} from "../src/app/services/training-insights";

describe("insights and report exports", () => {
  it("counts only completed sessions, excludes warmups, and does not mutate user history", () => {
    const data = seed(),
      baseline = JSON.stringify(data);
    const empty = summarizeTraining(data, 28, "2026-11-04");
    expect(empty.current.workouts).toBe(0);
    expect(empty.insights[0].kind).toBe("consistency");
    data.workouts.push({
      id: "w1",
      userId: "local",
      planId: "old",
      dayId: "d1",
      planName: "A;\nB",
      dayName: 'Scheda "A"',
      date: "2026-11-03",
      startedAt: "2026-11-03T10:00:00.000Z",
      duration: 35,
      notes: "",
      status: "completed",
    });
    data.workouts.push({
      id: "draft",
      userId: "local",
      planId: "old",
      dayId: "d1",
      planName: "Bozza",
      dayName: "Prova",
      date: "2026-11-04",
      startedAt: "2026-11-04T10:00:00.000Z",
      duration: 0,
      notes: "",
      status: "draft",
    });
    data.workoutExercises.push({
      id: "e1",
      workoutId: "w1",
      exerciseId: "ex",
      name: "Squat",
      loadMode: "external",
      order: 0,
      rest: 90,
      notes: "",
    });
    data.sets.push({
      id: "s1",
      workoutExerciseId: "e1",
      number: 1,
      weight: 50,
      reps: 10,
      completed: true,
    });
    data.sets.push({
      id: "s2",
      workoutExerciseId: "e1",
      number: 2,
      kind: "warmup",
      weight: 20,
      reps: 20,
      completed: true,
    });
    const summary = summarizeTraining(data, 7, "2026-11-04");
    expect(summary.current.workouts).toBe(1);
    expect(summary.current.completedSets).toBe(1);
    expect(summary.current.minutes).toBe(35);
    expect(summary.current.externalVolume).toBe(500);
    const timeline = trainingTimeline(data, 7, "2026-11-04");
    expect(timeline).toHaveLength(1);
    expect(timeline[0]).toMatchObject({ sessions: 1, volume: 500 });
    const csv = trainingReportCsv(data, "2026-11-01", "2026-11-04");
    expect(csv).toContain("A;");
    expect(csv).toContain('""A""');
    expect(csv).not.toContain("Bozza");
    expect(csv.split("\r\n").length).toBe(3);
    expect(JSON.stringify(seed())).toBe(baseline);
  });
  it("guards CSV text against spreadsheet formula injection", () => {
    const data = seed();
    data.workouts.push({
      id: "formula",
      userId: "local",
      planId: "p",
      dayId: "d",
      planName: '=HYPERLINK("https://example.org")',
      dayName: " +SUM(1,2)",
      date: "2026-11-03",
      startedAt: "2026-11-03T10:00:00.000Z",
      duration: 20,
      notes: "",
      status: "completed",
    });
    const csv = trainingReportCsv(data, "2026-11-01", "2026-11-04");
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain("' +SUM");
  });
  it("includes calendar alarms for timed sessions, validates dates and never auto-schedules", () => {
    const timed = workoutReminderIcs({
      id: "one",
      date: "2026-11-06",
      time: "18:30",
      dayName: "Gambe,\nA",
    });
    expect(timed).toContain("DTSTART:20261106T183000");
    expect(timed).toContain("TRIGGER:-PT60M");
    expect(timed).toContain("Gambe\\,\\nA");
    const day = workoutReminderIcs({
      id: "two",
      date: "2026-11-06",
      dayName: "Riposo",
    });
    expect(day).toContain("DTSTART;VALUE=DATE:20261106");
    expect(day).not.toContain("BEGIN:VALARM");
    expect(() =>
      workoutReminderIcs({ id: "x", date: "2026-02-30", dayName: "Err" }),
    ).toThrow();
    expect(() =>
      workoutReminderIcs({
        id: "x",
        date: "2026-11-06",
        time: "25:00",
        dayName: "Err",
      }),
    ).toThrow();
  });
});
