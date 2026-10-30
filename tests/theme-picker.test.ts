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
  component.choosePalette("ghiaccio");
  expect(component.draft()).toEqual({ palette: "ghiaccio", mode: "light" });
  expect(component.colors().light).toBe(true);
  component.chooseMode("system");
  component.setColor("accent", "00aacc");
  component.setColor("background", "#FFFFFF");
  expect(component.draft()).toEqual({
    palette: "ghiaccio",
    mode: "system",
    accent: "#00AACC",
    background: "#FFFFFF",
  });
  expect(theme.config()).toEqual(saved);
  expect(theme.saveConfig).not.toHaveBeenCalled();
  component.choosePalette("artico");
  expect(component.draft()).toEqual({ palette: "artico", mode: "system" });
  theme.systemLight.set(true);
  expect(component.colors().light).toBe(true);
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
