import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  DEFAULT_DESIGN,
  FACTORY_PRESETS,
  DESIGN_CONTROLS,
  parseDesign,
  validDesign,
  resolveDesign,
  resolvePageDesign,
  designStyles,
  designContrast,
} from "../shared/design-system.js";

const config = () => structuredClone(DEFAULT_DESIGN);
describe("GT Design Studio configuration boundary and cascade", () => {
  it("preserves the exact twelve factory palettes and the existing app by default", () => {
    expect(FACTORY_PRESETS).toEqual(
      JSON.parse(
        readFileSync(
          "docs/gt-design-studio/config/PALETTE_PREDEFINITE.json",
          "utf8",
        ),
      ).presets,
    );
    expect(FACTORY_PRESETS).toHaveLength(12);
    expect(Object.isFrozen(FACTORY_PRESETS[0].gradient.stops)).toBe(true);
    expect(
      designStyles(
        resolveDesign(config(), "home", "home.stats.workouts"),
        "button",
      ),
    ).toEqual({});
    expect(new Set(DESIGN_CONTROLS.map((c) => c.id)).size).toBe(
      DESIGN_CONTROLS.length,
    );
  });
  it("changes only the existing Home workout metric and restores inheritance by deleting the override", () => {
    const value = config();
    value.global.radius = 10;
    value.pages.home = { radius: 15 };
    value.instances["home.stats.workouts"] = {
      radius: 24,
      height: 56,
      fill: "#0077FF",
      label: "Le mie sessioni",
    };
    expect(resolveDesign(value, "home", "home.stats.workouts")).toMatchObject({
      radius: 24,
      height: 56,
      fill: "#0077FF",
    });
    expect(resolveDesign(value, "home", "home.stats.time")).toEqual({
      radius: 15,
    });
    expect(resolveDesign(value, "training", "training.actions.open")).toEqual({
      radius: 10,
    });
    delete value.instances["home.stats.workouts"];
    expect(resolveDesign(value, "home", "home.stats.workouts")).toEqual({
      radius: 15,
    });
    delete value.pages.home;
    expect(resolveDesign(value, "home", "home.stats.workouts")).toEqual({
      radius: 10,
    });
  });
  it("layers factory, global, page and instance values deterministically without mutating factory", () => {
    const before = JSON.stringify(FACTORY_PRESETS),
      value = config();
    value.presetId = "azzurro_gt";
    value.global.primary = "#AAEEFF";
    value.pages.progress = { primary: "#AAFFEE" };
    value.instances["progress.filters"] = { fill: "#234567" };
    expect(resolveDesign(value, "progress", "progress.filters")).toMatchObject({
      primary: "#AAFFEE",
      fill: "#234567",
    });
    expect(resolveDesign(value, "home", "home.stats.workouts").primary).toBe(
      "#AAEEFF",
    );
    expect(JSON.stringify(FACTORY_PRESETS)).toBe(before);
    value.enabled = false;
    expect(
      designStyles(
        resolveDesign(value, "progress", "progress.filters"),
        "button",
      ),
    ).toEqual({});
  });
  it.each([
    { role: "SuperAdmin" },
    { schemaVersion: 2 },
    { presetId: "missing" },
    { enabled: "true" },
    { pages: { "../../users": { radius: 12 } } },
    { instances: { "missing.control": { radius: 12 } } },
    { global: { onClick: "alert(1)" } },
    { global: { background: "url(https://attacker.test)" } },
    { global: { radius: -1 } },
    { global: { height: 0 } },
    { global: { opacity: 0 } },
    { global: { fontSize: 1 } },
    { global: { icon: "trash" } },
    { global: { label: "Forged" } },
    { instances: { "profile.logout": { label: "Conferma" } } },
    { instances: { "home.stats.workouts": { label: "<script>" } } },
    {
      global: {
        gradient: {
          type: "linear",
          angle: 135,
          stops: [
            { color: "#000000", offset: 1 },
            { color: "#FFFFFF", offset: 0 },
          ],
        },
      },
    },
    JSON.parse('{"instances":{"__proto__":{"role":"SuperAdmin"}}}'),
  ])(
    "rejects executable/functional/unknown or unsafe configuration %j",
    (patch) => {
      expect(validDesign({ ...config(), ...patch })).toBe(false);
      expect(() => parseDesign({ ...config(), ...patch })).toThrow();
    },
  );
  it("clones configuration before editing and does not leak changes into persisted snapshots", () => {
    const value = config();
    value.instances["home.stats.workouts"] = { fill: "#123456" };
    const parsed = parseDesign(value);
    parsed.instances["home.stats.workouts"].fill = "#654321";
    expect(value.instances["home.stats.workouts"].fill).toBe("#123456");
  });
  it("uses the exact factory page background, and applies background gradients only for explicit scope overrides", () => {
    for (const preset of FACTORY_PRESETS) {
      const value = config();
      value.presetId = preset.id;
      expect(
        designStyles(resolvePageDesign(value, "home"), "page").background,
      ).toBe(preset.background);
      value.pages.home = {
        gradient: {
          type: "linear",
          angle: 135,
          stops: [
            { color: "#040C19", offset: 0 },
            { color: "#132B43", offset: 1 },
          ],
        },
      };
      expect(
        designStyles(resolvePageDesign(value, "home"), "page").background,
      ).toContain("gradient(");
    }
  });
  it("keeps gradient/ink contrast safe and falls back to a solid fill for incompatible stops", () => {
    const css = designStyles(
      {
        primary: "#3579FF",
        text: "#FFFFFF",
        gradient: {
          type: "linear",
          angle: 120,
          stops: [
            { color: "#000000", offset: 0 },
            { color: "#FFFFFF", offset: 1 },
          ],
        },
      },
      "button",
    );
    expect(css.background).toBe("#3579FF");
    expect(designContrast(css.color, css.background)).toBeGreaterThanOrEqual(
      4.5,
    );
    for (const preset of FACTORY_PRESETS) {
      const value = config();
      value.presetId = preset.id;
      const styles = designStyles(
        resolveDesign(value, "home", "home.stats.workouts"),
        "button",
      );
      const backgrounds = styles.background.startsWith("#")
        ? [styles.background]
        : preset.gradient.stops.map((s) => s.color);
      expect(
        Math.min(...backgrounds.map((bg) => designContrast(styles.color, bg))),
      ).toBeGreaterThanOrEqual(4.5);
    }
  });
});
