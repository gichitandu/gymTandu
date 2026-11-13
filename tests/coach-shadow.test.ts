import { describe, expect, it } from "vitest";
import {
  coachNextSet,
  readinessFromWellness,
} from "../src/app/services/coach-shadow";

const base = { repsMin: 8, repsMax: 12, incrementKg: 2.5 };

describe("Coach Ombra", () => {
  it("non suggerisce nulla con parametri non validi", () => {
    expect(coachNextSet({ ...base, repsMax: 5, done: [] })).toBeNull();
    expect(coachNextSet({ ...base, incrementKg: 0, done: [] })).toBeNull();
  });

  it("non inventa un riferimento senza storico né carico impostato", () => {
    expect(coachNextSet({ ...base, done: [] })).toBeNull();
    expect(coachNextSet({ ...base, done: [], plannedWeight: 40 })).toMatchObject(
      { action: "hold", weight: 40, basis: "none" },
    );
  });

  it("propone un aumento se l'ultima volta era tutto a 12 con RPE fino a 8", () => {
    const reference = [1, 2, 3].map(() => ({ weight: 60, reps: 12, rpe: 8 }));
    expect(coachNextSet({ ...base, reference, done: [] })).toMatchObject({
      action: "raise",
      weight: 62.5,
      reps: 8,
      basis: "reference",
    });
  });

  it("non aumenta senza RPE registrato nello storico", () => {
    const reference = [{ weight: 60, reps: 12 }];
    expect(coachNextSet({ ...base, reference, done: [] })).toMatchObject({
      action: "hold",
      weight: 60,
    });
  });

  it("con poco recupero tiene il carico anche se lo storico permetterebbe di salire", () => {
    const reference = [{ weight: 60, reps: 12, rpe: 7 }];
    expect(
      coachNextSet({ ...base, reference, done: [], readiness: "low" }),
    ).toMatchObject({ action: "hold", weight: 60 });
  });

  it("riadatta dopo ogni serie: facile al massimo, sale", () => {
    expect(
      coachNextSet({ ...base, done: [{ weight: 60, reps: 12, rpe: 6.5 }] }),
    ).toMatchObject({ action: "raise", weight: 62.5, reps: 8 });
  });

  it("riadatta dopo ogni serie: sotto il minimo, scende", () => {
    expect(
      coachNextSet({ ...base, done: [{ weight: 60, reps: 6, rpe: 9 }] }),
    ).toMatchObject({ action: "lower", weight: 57.5 });
  });

  it("serie al limite: mantiene il carico", () => {
    expect(
      coachNextSet({ ...base, done: [{ weight: 60, reps: 9, rpe: 10 }] }),
    ).toMatchObject({ action: "hold", weight: 60, reps: 9 });
  });

  it("serie dura con recupero basso: alleggerisce", () => {
    expect(
      coachNextSet({
        ...base,
        readiness: "low",
        done: [{ weight: 60, reps: 10, rpe: 9 }],
      }),
    ).toMatchObject({ action: "lower", weight: 57.5 });
  });

  it("usa la serie più recente e ignora serie non valide", () => {
    expect(
      coachNextSet({
        ...base,
        done: [
          { weight: 60, reps: 10, rpe: 8 },
          { weight: Number.NaN, reps: 10 },
        ],
      }),
    ).toMatchObject({ weight: 60, reps: 11 });
  });

  it("il carico suggerito non scende sotto zero", () => {
    expect(
      coachNextSet({ ...base, done: [{ weight: 1, reps: 3, rpe: 10 }] })
        ?.weight,
    ).toBe(0);
  });
});

describe("prontezza dal check-in", () => {
  it("è undefined senza dati utilizzabili", () => {
    expect(readinessFromWellness(null)).toBeUndefined();
    expect(readinessFromWellness({})).toBeUndefined();
  });
  it("riconosce poco recupero e tratta lo stress alto come negativo", () => {
    expect(
      readinessFromWellness({ sleepQuality: 2, energy: 2, stress: 4 }),
    ).toBe("low");
    expect(
      readinessFromWellness({ sleepQuality: 4, energy: 4, stress: 2 }),
    ).toBe("normal");
  });
});

describe("Coach Ombra con il riscontro sulla serie", () => {
  it("con dolore segnalato oggi dice di fermarsi", () => {
    expect(
      coachNextSet({ ...base, done: [{ weight: 60, reps: 10, rpe: 7, pain: true }] }),
    ).toMatchObject({ action: "stop", basis: "session" });
  });

  it("con tecnica peggiorata nell'ultima serie dice di fermarsi", () => {
    expect(
      coachNextSet({ ...base, done: [{ weight: 60, reps: 10, technique: "degraded" }] }),
    ).toMatchObject({ action: "stop" });
  });

  it("usa le ripetizioni in riserva quando manca l'RPE", () => {
    expect(
      coachNextSet({ ...base, done: [{ weight: 60, reps: 12, rir: 3, technique: "good" }] }),
    ).toMatchObject({ action: "raise", weight: 62.5, reps: 8 });
    expect(
      coachNextSet({ ...base, done: [{ weight: 60, reps: 10, rir: 0 }] }),
    ).toMatchObject({ action: "hold", weight: 60, reps: 10 });
  });

  it("l'RPE indicato prevale sulle ripetizioni in riserva", () => {
    expect(
      coachNextSet({ ...base, done: [{ weight: 60, reps: 12, rpe: 9.5, rir: 4 }] }),
    ).toMatchObject({ action: "hold", weight: 60 });
  });

  it("aumenta dal riferimento anche con solo RIR dichiarati", () => {
    const reference = [{ weight: 50, reps: 12, rir: 2 }, { weight: 50, reps: 12, rir: 3 }];
    expect(coachNextSet({ ...base, reference, done: [] })).toMatchObject({ action: "raise", weight: 52.5 });
  });

  it("non aumenta se l'ultima volta c'era dolore o tecnica peggiorata", () => {
    const easy = { weight: 50, reps: 12, rpe: 7 };
    expect(coachNextSet({ ...base, reference: [easy, { ...easy, pain: true }], done: [] })).toMatchObject({ action: "hold", weight: 50 });
    expect(coachNextSet({ ...base, reference: [easy, { ...easy, technique: "degraded" as const }], done: [] })).toMatchObject({ action: "hold", weight: 50 });
  });
});
