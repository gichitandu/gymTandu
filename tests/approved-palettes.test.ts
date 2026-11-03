import "@angular/compiler";
import { afterEach, expect, it, vi } from "vitest";
import {signal} from '@angular/core';
import { readFileSync } from "node:fs";
import {
  APPROVED_THEME_PALETTES,
  APPROVED_THEME_IDS,
  APPROVED_DESIGN_PRESETS,
} from "../shared/approved-palettes.js";
import {
  DEFAULT_DESIGN,
  FACTORY_PRESETS,
  parseDesign,
  resolveDesign,
  resolvePageDesign,
  designStyles,
  designContrast,
} from "../shared/design-system.js";
import {
  THEME_PALETTES,
  THEME_PRESETS,
  resolveTheme,
  contrastRatio,
  validThemeConfig,
} from "../src/app/services/theme-palettes";
import { ThemeService } from "../src/app/services/theme";
import { seed } from "../src/app/core/seed";
import { exportBackup, importBackup } from "../src/app/services/backup";
afterEach(() => vi.unstubAllGlobals());

it("preserves the original blue/violet records and lists them first without duplicate palette IDs", () => {
  expect(APPROVED_THEME_IDS).toEqual([
    "blu-azzurro",
    "viola-neon",
    "petrolio-lumina",
    "smeraldo-sport",
    "rubino-carbonio",
    "oro-satinato",
    "argento-artico",
    "prugna-rose",
  ]);
  expect(APPROVED_THEME_PALETTES[0]).toEqual({
    id: "blu-azzurro",
    name: "Blu Azzurro",
    background: "#040C19",
    card: "#0C2036",
    accent: "#0DD9FF",
    text: "#F1FBFF",
    muted: "#A8C3D8",
    buttonText: "#031927",
    tone: "dark",
  });
  expect(APPROVED_THEME_PALETTES[1]).toEqual({
    id: "viola-neon",
    name: "Viola Neon",
    background: "#151225",
    card: "#28223D",
    accent: "#CC70FF",
    text: "#F7F5FF",
    muted: "#B8BCD4",
    buttonText: "#160726",
    tone: "dark",
  });
  expect(THEME_PRESETS.slice(0, 8).map((p) => p.id)).toEqual(
    APPROVED_THEME_IDS,
  );
  expect(new Set(THEME_PALETTES.map((p) => p.id)).size).toBe(
    THEME_PALETTES.length,
  );
  expect(THEME_PALETTES).toHaveLength(21);
  expect(FACTORY_PRESETS).toHaveLength(12);
});

it("uses the reviewed colours and immutable preset data for all six new proposals", () => {
  const approved = JSON.parse(
    readFileSync("docs/GT_PALETTE_APPROVATE.json", "utf8"),
  );
  for (let index = 2; index < 8; index++) {
    const palette = APPROVED_THEME_PALETTES[index],
      proposal = approved.palettes[index];
    expect(palette).toMatchObject({
      name: proposal.name,
      background: proposal.background,
      card: proposal.card,
      accent: proposal.accent,
      secondary: proposal.secondary,
      buttonStart: proposal.buttonGradient[0],
      buttonEnd: proposal.buttonGradient[1],
      buttonText: proposal.buttonText,
      finish: "satin",
    });
    expect(Object.isFrozen(palette)).toBe(true);
    expect(Object.isFrozen(APPROVED_DESIGN_PRESETS[index].gradient.stops)).toBe(
      true,
    );
  }
});

it.each(APPROVED_THEME_IDS)(
  "retains the %s palette in local backups without changing plans, sets or profile",
  async (palette) => {
    const data = seed();
    data.settings[0].themeConfig = { palette, mode: "dark" };
    const exported = await exportBackup(data),
      restored = await importBackup(exported);
    expect(restored.settings[0].themeConfig).toEqual({ palette, mode: "dark" });
    expect(JSON.parse(await exportBackup(restored)).data).toEqual(
      JSON.parse(exported).data,
    );
  },
);

it("uses coordinated readable gradient endpoints and honours custom accent overrides", () => {
  for (const palette of APPROVED_THEME_PALETTES.slice(2))
    for (const mode of ["dark", "light", "system"] as const) {
      const original = resolveTheme({ palette: palette.id, mode }, false);
      expect(original.buttonStart).toBe(palette.buttonStart);
      expect(original.buttonEnd).toBe(palette.buttonEnd);
      for (const stop of [
        original.accent,
        original.buttonStart,
        original.buttonEnd,
      ])
        expect(contrastRatio(original.buttonText, stop)).toBeGreaterThanOrEqual(
          4.5,
        );
      for (const accent of ["#777777", "#FFFFFF", "#000000", "#24BBCC"]) {
        const tokens = resolveTheme(
          { palette: palette.id, mode, accent },
          false,
        );
        expect(tokens.accent).toBe(accent);
        expect(tokens.buttonStart).toBe(accent);
        expect(tokens.buttonEnd).toBe(accent);
        expect(contrastRatio(tokens.buttonText, accent)).toBeGreaterThanOrEqual(
          4.5,
        );
      }
    }
});

it("offers every approved palette in Studio without changing the original twelve factory presets", () => {
  for (const preset of APPROVED_DESIGN_PRESETS) {
    const config = { ...structuredClone(DEFAULT_DESIGN), presetId: preset.id };
    expect(parseDesign(config)).toEqual(config);
    expect(
      designStyles(resolvePageDesign(config, "home"), "page").background,
    ).toBe(preset.background);
    const primary = designStyles(
      resolveDesign(config, "home", "home.actions.schedule"),
      "button",
    );
    const surfaces = primary.background.startsWith("#")
      ? [primary.background]
      : preset.gradient.stops.map((stop) => stop.color);
    for (const surface of surfaces)
      expect(designContrast(primary.color, surface)).toBeGreaterThanOrEqual(
        4.5,
      );
    const secondary = designStyles(
      resolveDesign(config, "home", "home.stats.workouts"),
      "button",
    );
    expect(secondary.background).toContain(preset.card);
    expect(secondary["box-shadow"]).not.toContain(
      "color-mix(in srgb, " + preset.primary,
    );
    expect(
      designStyles(resolveDesign(config, "home", "home.title"), "text")[
        "box-shadow"
      ],
    ).toBe("none");
  }
});

it("lets a solid instance override a curated gradient and restores inherited gradient after removal", () => {
  const config = {
    ...structuredClone(DEFAULT_DESIGN),
    presetId: "petrolio-lumina",
  };
  const inherited = designStyles(
    resolveDesign(config, "home", "home.actions.schedule"),
    "button",
  );
  config.instances["home.actions.schedule"] = { fill: "#123456", radius: 24 };
  expect(
    designStyles(
      resolveDesign(config, "home", "home.actions.schedule"),
      "button",
    ).background,
  ).toBe("#123456");
  delete config.instances["home.actions.schedule"];
  expect(
    designStyles(
      resolveDesign(config, "home", "home.actions.schedule"),
      "button",
    ),
  ).toEqual(inherited);
});

it("keeps original body finish classes unchanged and enables satin only for the new palettes", () => {
  for (const palette of APPROVED_THEME_PALETTES) {
    const classes = new Map(),
      styles = new Map();
    vi.stubGlobal("document", {
      body: {
        style: {
          setProperty: (key: string, value: string) => styles.set(key, value),
        },
        dataset: {},
        classList: {
          toggle: (key: string, value: boolean) => classes.set(key, value),
        },
      },
      querySelector: () => null,
    });
    ThemeService.prototype.apply.call({
      config: () => ({ palette: palette.id, mode: "dark" }),
      systemLight: () => false,
      color: signal(""),
    } as any);
    const original = ["blu-azzurro", "viola-neon"].includes(palette.id);
    expect(classes.get("theme-satin")).toBe(!original);
    expect(classes.get("theme-preset")).toBe(!original);
    expect(styles.get("--bg")).toBe(palette.background);
    expect(
      validThemeConfig({
        palette: palette.id,
        mode: "dark",
        role: "SuperAdmin",
      }),
    ).toBe(false);
  }
});
