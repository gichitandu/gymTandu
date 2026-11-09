import { describe, expect, it } from "vitest";
import {
  MUSCLE_ZONES,
  muscleZoneFor,
  preferredMuscleView,
} from "../src/app/services/muscle-zones";

describe("zone della figura nel Focus muscolare", () => {
  it("associa i gruppi del catalogo e i nomi personalizzati alla zona giusta", () => {
    expect(
      [
        "Petto",
        "Schiena",
        "Spalle",
        "Gambe",
        "Braccia",
        "Core",
        "Glutei",
        "Polpacci",
      ].map(muscleZoneFor),
    ).toEqual([
      "petto",
      "schiena",
      "spalle",
      "gambe",
      "braccia",
      "core",
      "glutei",
      "polpacci",
    ]);
    expect(muscleZoneFor("Bicipiti")).toBe("braccia");
    expect(muscleZoneFor("Femorali")).toBe("gambe");
    expect(muscleZoneFor("Addome")).toBe("core");
    expect(muscleZoneFor("Collo")).toBeUndefined();
  });
  it("passa alla vista in cui la zona è visibile", () => {
    expect(preferredMuscleView("schiena", "front")).toBe("back");
    expect(preferredMuscleView("petto", "back")).toBe("front");
    expect(preferredMuscleView("spalle", "back")).toBe("back");
  });
  it("ogni zona esiste in almeno una vista", () => {
    for (const zone of [
      "petto",
      "schiena",
      "spalle",
      "braccia",
      "core",
      "gambe",
      "glutei",
      "polpacci",
    ] as const)
      expect(!!(MUSCLE_ZONES.front[zone] || MUSCLE_ZONES.back[zone])).toBe(
        true,
      );
  });
});
