import { describe, expect, it } from "vitest";
import { seed } from "../src/app/core/seed";
import { deloadInsight } from "../src/app/services/training-insights";

const day = (today: string, back: number) => {
  const d = new Date(today + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
};

function withWeeks(today: string, sessionsPerWeek: number[]) {
  const data = seed();
  let n = 0;
  sessionsPerWeek.forEach((count, week) => {
    for (let i = 0; i < count; i++) {
      const date = day(today, week * 7 + i * 2);
      data.workouts.push({
        id: "w" + n,
        userId: "local",
        planId: "p",
        dayId: "d",
        planName: "P",
        dayName: "D",
        date,
        startedAt: date + "T10:00:00.000Z",
        duration: 40,
        notes: "",
        status: "completed",
      });
      n++;
    }
  });
  return data;
}

describe("settimana di scarico", () => {
  const today = "2026-11-08";
  it("non lo suggerisce a chi si allena solo 2 volte a settimana", () => {
    expect(deloadInsight(withWeeks(today, [2, 2, 2, 2, 2]), today)).toBeNull();
  });
  it("non suggerisce nulla con poche settimane consecutive", () => {
    expect(deloadInsight(withWeeks(today, [3, 3, 3]), today)).toBeNull();
  });
  it("suggerisce lo scarico dopo 4 settimane con almeno 3 sedute", () => {
    const insight = deloadInsight(withWeeks(today, [3, 4, 3, 3]), today);
    expect(insight?.kind).toBe("recovery");
    expect(insight?.message).toContain("4 settimane");
  });
  it("non lo suggerisce se la settimana più recente è già leggera", () => {
    expect(deloadInsight(withWeeks(today, [1, 3, 3, 3, 3]), today)).toBeNull();
  });
  it("ignora le bozze e non altera i dati", () => {
    const data = withWeeks(today, [3, 3, 3, 3]);
    data.workouts.forEach((w) => (w.status = "draft"));
    const before = JSON.stringify(data);
    expect(deloadInsight(data, today)).toBeNull();
    expect(JSON.stringify(data)).toBe(before);
  });
});
