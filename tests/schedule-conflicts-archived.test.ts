import { describe, expect, it } from "vitest";
import { seed } from "../src/app/core/seed";
import { scheduleConflicts } from "../src/app/services/plan-program";

const program = { importId: "i", sourceName: "x.xlsx", sourceKind: "original", fileHash: "a".repeat(64), startDate: "2026-10-05", endDate: "2026-11-29", weeks: 8 } as any;
const plan = (id: string, extra: any = {}) => ({ id, userId: "local", name: id, description: "", createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z", active: false, archived: false, ...extra });

describe("conflitti di calendario e piani archiviati", () => {
  it("un programma aperto occupa le sue date", () => {
    const data = seed();
    data.plans.push(plan("prog", { program }) as any);
    expect(scheduleConflicts(data, ["2026-11-08"], "altro").length).toBe(1);
  });
  it("un piano archiviato o concluso non blocca più le date", () => {
    const data = seed();
    data.plans.push(plan("prog", { program, archived: true, completedAt: "2026-11-01T00:00:00.000Z" }) as any);
    expect(scheduleConflicts(data, ["2026-11-08"], "altro")).toEqual([]);
  });
});
