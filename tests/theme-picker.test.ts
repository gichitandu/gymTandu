import "@angular/compiler";
import {
  createEnvironmentInjector,
  EnvironmentInjector,
  runInInjectionContext,
  signal,
} from "@angular/core";
import { afterEach, expect, it, vi } from "vitest";
import { AuthService } from "../src/app/services/auth";
import { ThemeService } from "../src/app/services/theme";
import { ThemeConfig } from "../src/app/services/theme-palettes";
import { ThemePickerComponent } from "../src/app/shared/theme-picker.component";

const effects = vi.hoisted(() => [] as (() => void)[]);
vi.mock("@angular/core", async (original) => ({
  ...(await original<typeof import("@angular/core")>()),
  effect: (callback: () => void) => {
    effects.push(callback);
    return { destroy: () => {} };
  },
}));
const injectors: EnvironmentInjector[] = [];
afterEach(() => {
  injectors.splice(0).forEach((injector) => injector.destroy());
  effects.length = 0;
});
const saved: ThemeConfig = { palette: "carbonio", mode: "dark" };
function flushEffects() {
  effects.forEach((callback) => callback());
}
function setup() {
  const theme = {
      config: signal<ThemeConfig>({ ...saved }),
      systemLight: signal(false),
      saveConfig: vi
        .fn<(config: ThemeConfig) => Promise<boolean>>()
        .mockResolvedValue(true),
    },
    auth = { user: signal({ id: "alice" }) };
  const injector = createEnvironmentInjector(
    [
      { provide: ThemeService, useValue: theme },
      { provide: AuthService, useValue: auth },
    ],
    null as unknown as EnvironmentInjector,
  );
  injectors.push(injector);
  const component = runInInjectionContext(
    injector,
    () => new ThemePickerComponent(),
  );
  flushEffects();
  return { component, theme, auth };
}

it("previews preset, mode and color choices locally until explicit save", () => {
  const { component, theme } = setup();
  component.choosePalette("bianco-elegante");
  expect(component.draft()).toEqual({
    palette: "bianco-elegante",
    mode: "light",
  });
  expect(component.colors().light).toBe(true);
  component.chooseMode("system");
  component.setColor("accent", "00aacc");
  component.setColor("background", "#FFFFFF");
  expect(component.draft()).toEqual({
    palette: "bianco-elegante",
    mode: "system",
    accent: "#00AACC",
    background: "#FFFFFF",
  });
  expect(theme.config()).toEqual(saved);
  expect(theme.saveConfig).not.toHaveBeenCalled();
  component.choosePalette("verde");
  expect(component.draft()).toEqual({ palette: "verde", mode: "system" });
  theme.systemLight.set(true);
  expect(component.colors().light).toBe(true);
  expect(theme.saveConfig).not.toHaveBeenCalled();
});

it("offers the eight approved palettes and keeps the seven previous presets without discarding the saved theme", () => {
  const { component } = setup();
  expect(component.palettes.map((palette) => palette.id)).toEqual([
    "blu-azzurro",
    "viola-neon",
    "petrolio-lumina",
    "smeraldo-sport",
    "rubino-carbonio",
    "oro-satinato",
    "argento-artico",
    "prugna-rose",
    "oro",
    "argento",
    "multicolore",
    "bianco-elegante",
    "scuro",
    "rosso",
    "verde",
  ]);
  expect(component.draft()).toEqual(saved);
  expect(component.isLegacyPalette()).toBe(true);
  expect(component.selectedPalette()?.name).toBe("Carbonio");
  component.choosePalette("oro");
  expect(component.isLegacyPalette()).toBe(false);
  component.cancel();
  expect(component.draft()).toEqual(saved);
});

it("keeps multicolor accents until customized and can restore the preset colors", () => {
  const { component, theme } = setup();
  component.choosePalette("multicolore");
  expect(component.previewSecondary()).not.toBe(component.colors().accent);
  expect(component.previewTertiary()).not.toBe(component.colors().accent);
  component.setColor("accent", "#AACCEE");
  component.setColor("background", "#18222F");
  expect(component.previewSecondary()).toBe("#AACCEE");
  expect(component.previewTertiary()).toBe("#AACCEE");
  expect(component.colors().background).toBe("#18222F");
  component.resetColors();
  expect(component.draft()).toEqual({ palette: "multicolore", mode: "dark" });
  expect(component.previewSecondary()).not.toBe(component.colors().accent);
  expect(theme.saveConfig).not.toHaveBeenCalled();
});

it("cancels a local draft and never writes to the account", () => {
  const { component, theme } = setup();
  component.choosePalette("prugna");
  component.setColor("background", "#342731");
  expect(component.dirty()).toBe(true);
  component.cancel();
  expect(component.draft()).toEqual(saved);
  expect(component.dirty()).toBe(false);
  expect(theme.saveConfig).not.toHaveBeenCalled();
});

it("lets an explicit mode change replace a custom background while preserving the accent", () => {
  const { component, theme } = setup();
  component.setColor("background", "#000000");
  component.setColor("accent", "#AA7733");
  component.chooseMode("light");
  expect(component.draft()).toEqual({
    palette: "carbonio",
    mode: "light",
    accent: "#AA7733",
  });
  expect(component.colors().light).toBe(true);
  expect(component.colors().background).not.toBe("#000000");
  expect(theme.saveConfig).not.toHaveBeenCalled();
});

it("accepts account-loaded preferences while clean and preserves unsaved edits", () => {
  const { component, theme } = setup();
  theme.config.set({ palette: "sabbia", mode: "light" });
  flushEffects();
  expect(component.draft()).toEqual(theme.config());
  component.choosePalette("petrolio");
  theme.config.set({ palette: "ghiaccio", mode: "system" });
  flushEffects();
  expect(component.draft()).toEqual({ palette: "petrolio", mode: "dark" });
  component.cancel();
  expect(component.draft()).toEqual({ palette: "ghiaccio", mode: "system" });
  expect(component.dirty()).toBe(false);
});

it("saves once and preserves edits made while the save acknowledgement is pending", async () => {
  const { component, theme } = setup();
  component.choosePalette("prugna");
  const snapshot = structuredClone(component.draft());
  let finish!: (ok: boolean) => void;
  theme.saveConfig.mockReturnValue(
    new Promise((resolve) => (finish = resolve)),
  );
  const pending = component.save();
  await component.save();
  expect(component.saving()).toBe(true);
  expect(theme.saveConfig).toHaveBeenCalledExactlyOnceWith(snapshot);
  component.setColor("accent", "#AA7733");
  theme.config.set(snapshot);
  flushEffects();
  finish(true);
  await pending;
  expect(component.saving()).toBe(false);
  expect(component.draft()).toEqual({ ...snapshot, accent: "#AA7733" });
  expect(component.dirty()).toBe(true);
  component.cancel();
  expect(component.draft()).toEqual(snapshot);
  expect(component.dirty()).toBe(false);
});

it("forgets a previous account draft and ignores its late save acknowledgement", async () => {
  const { component, theme, auth } = setup();
  component.choosePalette("prugna");
  let finish!: (ok: boolean) => void;
  theme.saveConfig.mockReturnValue(
    new Promise((resolve) => (finish = resolve)),
  );
  const pending = component.save();
  const bob: ThemeConfig = { palette: "sabbia", mode: "light" };
  theme.config.set(bob);
  auth.user.set({ id: "bob" });
  flushEffects();
  expect(component.draft()).toEqual(bob);
  expect(component.dirty()).toBe(false);
  finish(true);
  await pending;
  expect(component.draft()).toEqual(bob);
  expect(component.dirty()).toBe(false);
  expect(component.saving()).toBe(false);
});

it("keeps the selected draft available to retry when saving fails", async () => {
  const { component, theme } = setup();
  component.choosePalette("petrolio");
  theme.saveConfig.mockRejectedValueOnce(Error("storage unavailable"));
  await component.save();
  expect(component.dirty()).toBe(true);
  expect(component.issue()).toContain("Riprova");
  expect(component.saving()).toBe(false);
  theme.saveConfig.mockImplementationOnce(async (config) => {
    theme.config.set(config);
    return true;
  });
  await component.save();
  expect(theme.saveConfig).toHaveBeenCalledTimes(2);
  expect(component.dirty()).toBe(false);
  expect(component.issue()).toBe("");
});

it("rejects malformed HEX input without corrupting the draft or writing a preference", () => {
  const { component, theme } = setup();
  component.setColor("accent", "not-a-color");
  expect(component.draft()).toEqual(saved);
  expect(component.issue()).toContain("HEX");
  expect(theme.saveConfig).not.toHaveBeenCalled();
  component.setColor("accent", "#12aBcD");
  expect(component.draft().accent).toBe("#12ABCD");
  expect(component.issue()).toBe("");
  component.resetColors();
  expect(component.draft()).toEqual(saved);
});

it("previews every approved palette without saving, then restores its original colours after customisation", () => {
  const { component, theme } = setup();
  expect(component.paletteGroups[0].palettes).toHaveLength(8);
  expect(component.paletteGroups[1].palettes).toHaveLength(7);
  for (const palette of component.paletteGroups[0].palettes) {
    component.choosePalette(palette.id);
    expect(component.draft()).toEqual({ palette: palette.id, mode: "dark" });
    component.setColor("accent", "#ABCDEF");
    component.setColor("background", "#112233");
    component.resetColors();
    expect(component.colors().background).toBe(palette.background);
    expect(component.colors().accent).toBe(palette.accent);
    component.cancel();
    expect(component.draft()).toEqual(saved);
  }
  expect(theme.saveConfig).not.toHaveBeenCalled();
});
