import {
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from "@angular/core";
import { ThemeService } from "../services/theme";
import { AuthService } from "../services/auth";
import {
  ThemeConfig,
  ThemeMode,
  ThemeStyle,
  THEME_PALETTES,
  SELECTABLE_THEME_PRESETS,
  resolveTheme,
  validThemeConfig,
} from "../services/theme-palettes";
import { IconComponent } from "./icon.component";

@Component({
  selector: "gt-theme-picker",
  standalone: true,
  imports: [IconComponent],
  templateUrl: "./theme-picker.component.html",
  styleUrl: "./theme-picker.component.css",
})
export class ThemePickerComponent {
  readonly theme = inject(ThemeService);
  private auth = inject(AuthService);
  readonly palettes = SELECTABLE_THEME_PRESETS;
  readonly paletteGroups = [
    { id: "themes", name: "Temi", palettes: SELECTABLE_THEME_PRESETS },
  ];
  readonly modes: { value: ThemeMode; label: string }[] = [
    { value: "dark", label: "Scuro" },
    { value: "light", label: "Chiaro" },
    { value: "system", label: "Sistema" },
  ];
  readonly styles: { value: ThemeStyle; label: string; hint: string }[] = [
    { value: "classic", label: "Classico", hint: "L’aspetto di sempre" },
    { value: "elegant", label: "Elegante", hint: "Essenziale, titoli grandi" },
  ];
  readonly draft = signal<ThemeConfig>(structuredClone(this.theme.config()));
  private baseline = signal(JSON.stringify(this.theme.config()));
  readonly dirty = computed(
    () => JSON.stringify(this.draft()) !== this.baseline(),
  );
  readonly colors = computed(() =>
    resolveTheme(this.draft(), this.theme.systemLight()),
  );
  readonly selectedPalette = computed(() =>
    THEME_PALETTES.find((palette) => palette.id === this.draft().palette),
  );
  readonly isLegacyPalette = computed(
    () => !this.palettes.some((palette) => palette.id === this.draft().palette),
  );
  readonly previewSecondary = computed(() =>
    this.draft().accent
      ? this.colors().accent
      : this.selectedPalette()?.secondary || this.colors().accent,
  );
  readonly previewTertiary = computed(() =>
    this.draft().accent
      ? this.colors().accent
      : this.selectedPalette()?.tertiary || this.colors().accent,
  );
  readonly saving = signal(false);
  readonly issue = signal("");
  private account = "";
  private generation = 0;
  constructor() {
    effect(() => {
      const saved = this.theme.config(),
        id = this.auth.user()?.id || "device-local";
      untracked(() => {
        if (id !== this.account) {
          this.account = id;
          this.generation++;
          this.reset(saved);
        } else if (!this.dirty()) this.reset(saved);
      });
    });
  }
  private reset(config: ThemeConfig) {
    this.draft.set(structuredClone(config));
    this.baseline.set(JSON.stringify(config));
    this.issue.set("");
  }
  choosePalette(id: string) {
    const palette = THEME_PALETTES.find((p) => p.id === id);
    if (!palette) return;
    this.issue.set("");
    this.draft.set({
      palette: id,
      mode: this.draft().mode === "system" ? "system" : palette.tone,
      ...this.styleOf(),
    });
  }
  private styleOf() {
    const style = this.draft().style;
    return style ? { style } : {};
  }
  /** «Classico» is stored as no value, so existing saved themes stay identical. */
  chooseStyle(style: ThemeStyle) {
    this.issue.set("");
    this.draft.update(({ style: _previous, ...config }) =>
      style === "elegant" ? { ...config, style } : config,
    );
  }
  chooseMode(mode: ThemeMode) {
    this.issue.set("");
    this.draft.update(({ background, ...config }) => ({ ...config, mode }));
  }
  setColor(key: "background" | "accent", value: string) {
    let hex = value.trim();
    if (/^[a-f0-9]{6}$/i.test(hex)) hex = "#" + hex;
    if (!/^#[a-f0-9]{6}$/i.test(hex)) {
      this.issue.set("Usa un codice HEX come #101416.");
      return;
    }
    this.issue.set("");
    this.draft.update((config) => ({ ...config, [key]: hex.toUpperCase() }));
  }
  resetColors() {
    this.issue.set("");
    this.draft.set({
      palette: this.draft().palette,
      mode: this.draft().mode,
      ...this.styleOf(),
    });
  }
  cancel() {
    if (!this.saving()) this.reset(this.theme.config());
  }
  async save() {
    if (this.saving() || !this.dirty() || !validThemeConfig(this.draft()))
      return;
    const snapshot = structuredClone(this.draft()),
      serialized = JSON.stringify(snapshot),
      account = this.account,
      generation = this.generation;
    this.saving.set(true);
    this.issue.set("");
    try {
      const ok = await this.theme.saveConfig(snapshot);
      if (account !== this.account || generation !== this.generation) return;
      if (ok) {
        this.baseline.set(serialized);
        if (JSON.stringify(this.draft()) === serialized)
          this.draft.set(structuredClone(snapshot));
      }
    } catch {
      if (account === this.account && generation === this.generation)
        this.issue.set(
          "Tema non salvato. La scelta precedente resta conservata. Riprova.",
        );
    } finally {
      this.saving.set(false);
    }
  }
}
