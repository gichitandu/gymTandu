import { describe, expect, it } from "vitest";
import { seed } from "../src/app/core/seed";
import {
  missingProgramEvents,
  scheduleConflicts,
} from "../src/app/services/plan-program";

const program = {
  importId: "i",
  sourceName: "x.xlsx",
  sourceKind: "original",
  fileHash: "a".repeat(64),
  startDate: "2026-10-05",
  endDate: "2026-11-29",
  weeks: 8,
} as any;
const plan = (id: string, extra: any = {}) => ({
  id,
  userId: "local",
  name: id,
  description: "",
  createdAt: "2026-10-01T00:00:00.000Z",
  updatedAt: "2026-10-01T00:00:00.000Z",
  active: false,
  archived: false,
  ...extra,
});

describe("conflitti di calendario e piani archiviati", () => {
  it("un programma aperto occupa le sue date", () => {
    const data = seed();
    data.plans.push(plan("prog", { program }) as any);
    expect(scheduleConflicts(data, ["2026-11-08"], "altro").length).toBe(1);
  });
  it("un piano archiviato o concluso non blocca più le date", () => {
    const data = seed();
    data.plans.push(
      plan("prog", {
        program,
        archived: true,
        completedAt: "2026-11-01T00:00:00.000Z",
      }) as any,
    );
    expect(scheduleConflicts(data, ["2026-11-08"], "altro")).toEqual([]);
  });
});

describe("piano attivo e calendario del programma", () => {
  const withDay = (data: any, planId: string, dayId: string, date: string) => {
    data.days.push({
      id: dayId,
      planId,
      name: "Seduta " + dayId,
      order: 0,
      sessionDate: date,
    });
  };
  it("eventi e allenamenti di un piano archiviato non bloccano più la data", () => {
    const data = seed() as any;
    data.plans.push(
      plan("vecchio", {
        archived: true,
        completedAt: "2026-11-01T00:00:00.000Z",
      }),
    );
    data.scheduledWorkouts.push({
      id: "e1",
      date: "2026-11-09",
      planId: "vecchio",
      dayId: "d",
      planName: "vecchio",
      dayName: "A",
      notes: "",
    });
    data.workouts.push({
      id: "w1",
      userId: "local",
      planId: "vecchio",
      dayId: "d",
      planName: "vecchio",
      dayName: "A",
      date: "2026-11-09",
      startedAt: "2026-11-09T08:00:00.000Z",
      duration: 0,
      notes: "",
      status: "completed",
    });
    expect(scheduleConflicts(data, ["2026-11-09"], "attivo")).toEqual([]);
  });
  it("un piano aperto ma inattivo non blocca l'avvio del piano attivo", () => {
    const data = seed() as any;
    data.plans.push(
      plan("attivo", { active: true, program }),
      plan("inattivo", { program }),
    );
    data.scheduledWorkouts.push({
      id: "e1",
      date: "2026-11-09",
      planId: "inattivo",
      dayId: "d",
      planName: "inattivo",
      dayName: "A",
      notes: "",
    });
    expect(
      scheduleConflicts(data, ["2026-11-09"], "attivo").length,
    ).toBeGreaterThan(0);
    expect(
      scheduleConflicts(data, ["2026-11-09"], "attivo", undefined, {
        onlyActivePlans: true,
      }),
    ).toEqual([]);
    data.workouts.push({
      id: "w2",
      userId: "local",
      planId: "inattivo",
      dayId: "d",
      planName: "inattivo",
      dayName: "A",
      date: "2026-11-09",
      startedAt: "2026-11-09T08:00:00.000Z",
      duration: 0,
      notes: "",
      status: "completed",
    });
    expect(
      scheduleConflicts(data, ["2026-11-09"], "attivo", undefined, {
        onlyActivePlans: true,
      }).length,
    ).toBe(1);
  });
  it("ricrea solo gli eventi mancanti delle sedute del programma, collegando quelle già registrate", () => {
    const data = seed() as any;
    data.plans.push(plan("attivo", { active: true, program }));
    withDay(data, "attivo", "d1", "2026-11-09");
    withDay(data, "attivo", "d2", "2026-11-11");
    withDay(data, "attivo", "d3", "2026-11-13");
    data.scheduledWorkouts.push({
      id: "e3",
      date: "2026-11-13",
      planId: "attivo",
      dayId: "d3",
      planName: "attivo",
      dayName: "C",
      notes: "",
    });
    data.workouts.push({
      id: "w1",
      userId: "local",
      planId: "attivo",
      dayId: "d1",
      planName: "attivo",
      dayName: "Seduta d1",
      date: "2026-11-09",
      startedAt: "2026-11-09T08:00:00.000Z",
      duration: 0,
      notes: "",
      status: "completed",
    });
    const added = missingProgramEvents(data, ["attivo"]);
    expect(added.map((e) => [e.dayId, e.date, e.workoutId])).toEqual([
      ["d1", "2026-11-09", "w1"],
      ["d2", "2026-11-11", undefined],
    ]);
    data.scheduledWorkouts.push(...added);
    expect(missingProgramEvents(data, ["attivo"])).toEqual([]);
  });
  it("non tocca piani archiviati", () => {
    const data = seed() as any;
    data.plans.push(plan("chiuso", { archived: true, program }));
    withDay(data, "chiuso", "d1", "2026-11-09");
    expect(missingProgramEvents(data)).toEqual([]);
  });
});
