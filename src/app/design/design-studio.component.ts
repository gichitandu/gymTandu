import { Component, ElementRef, computed, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { RouterLink } from "@angular/router";
import {
  DEFAULT_DESIGN,
  DESIGN_COLORS,
  DESIGN_CONTROLS,
  DESIGN_ICONS,
  DESIGN_NUMBERS,
  DESIGN_PAGES,
  FACTORY_PRESETS,
  DesignFactory,
  gradientCss,
  APPROVED_DESIGN_PRESETS,
  DesignConfig,
  DesignGradient,
  DesignPage,
  DesignStyle,
  designWarnings,
  parseDesign,
  resolveDesign,
} from "../../../shared/design-system.js";
import { AuthService } from "../services/auth";
import { ConfirmationService } from "../services/confirmation";
import { IconComponent } from "../shared/icon.component";
import {
  DesignDraft,
  DesignRuntime,
  DesignStudioState,
  SavedDesignPreset,
} from "./design-runtime";
import { DesignPreviewComponent } from "./design-preview.component";

type StyleKey = keyof DesignStyle;
type Scope = "instance" | "page" | "global";
interface NumberField {
  key: StyleKey;
  name: string;
  unit: string;
  group: "layout" | "type" | "effects";
  min: number;
  max: number;
  step: number;
}
const FIELD_NAMES: Record<string, string> = {
  radius: "Raggio",
  height: "Altezza minima",
  paddingX: "Spaziatura orizzontale",
  paddingY: "Spaziatura verticale",
  marginY: "Margine verticale",
  borderWidth: "Spessore bordo",
  fontSize: "Dimensione testo",
  fontWeight: "Peso testo",
  lineHeight: "Interlinea",
  letterSpacing: "Spaziatura lettere",
  iconSize: "Dimensione icona",
  opacity: "Opacità",
  glowIntensity: "Intensità neon",
  glowBlur: "Diffusione glow",
  glowSpread: "Espansione glow",
  shadowBlur: "Diffusione ombra",
  shadowOpacity: "Opacità ombra",
  blur: "Blur dello sfondo",
  duration: "Durata transizione",
};
const COLOR_NAMES: Record<string, string> = {
  background: "Sfondo pagina",
  surface: "Superficie rialzata",
  card: "Card e contenitori",
  primary: "Colore primario",
  secondary: "Colore secondario",
  text: "Testo",
  muted: "Testo secondario",
  border: "Bordo",
  fill: "Sfondo del controllo",
  glowColor: "Colore neon",
  shadowColor: "Colore ombra",
};

@Component({
  standalone: true,
  imports: [FormsModule, RouterLink, IconComponent, DesignPreviewComponent],
  templateUrl: "./design-studio.component.html",
  styleUrl: "./design-studio.component.css",
})
export class DesignStudioComponent {
  auth = inject(AuthService);
  runtime = inject(DesignRuntime);
  private confirmation = inject(ConfirmationService);
  state = signal<DesignStudioState | null>(null);
  draft = signal<DesignConfig>(structuredClone(DEFAULT_DESIGN));
  private saved = signal(JSON.stringify(DEFAULT_DESIGN));
  private draftVersion = 0;
  private baseRevision = 0;
  private generation = 0;
  private disposed = false;
  busy = signal(false);
  loading = signal(true);
  error = signal("");
  notice = signal("");
  tab = signal<"controls" | "themes" | "history">("controls");
  scope = signal<Scope>("instance");
  page = signal<DesignPage>("home");
  selected = signal("home.stats.workouts");
  search = signal("");
  previewOnMobile = signal(false);
  private element = inject<ElementRef<HTMLElement>>(ElementRef);
  group = signal<"layout" | "type" | "effects">("layout");
  presetName = "";
  renameName = "";
  pages = DESIGN_PAGES;
  factories = FACTORY_PRESETS;
  approvedFactories = APPROVED_DESIGN_PRESETS;
  icons = DESIGN_ICONS;
  numbers: NumberField[] = Object.entries(DESIGN_NUMBERS).map(
    ([key, [min, max, step]]) => ({
      key: key as StyleKey,
      name: FIELD_NAMES[key],
      unit: [
        "glowIntensity",
        "shadowOpacity",
        "opacity",
        "lineHeight",
      ].includes(key)
        ? ""
        : ["fontWeight"].includes(key)
          ? ""
          : key === "duration"
            ? "ms"
            : "px",
      group: [
        "fontSize",
        "fontWeight",
        "lineHeight",
        "letterSpacing",
        "iconSize",
      ].includes(key)
        ? "type"
        : [
              "opacity",
              "glowIntensity",
              "glowBlur",
              "glowSpread",
              "shadowBlur",
              "shadowOpacity",
              "blur",
              "duration",
            ].includes(key)
          ? "effects"
          : "layout",
      min,
      max,
      step,
    }),
  );
  controls = computed(() =>
    DESIGN_CONTROLS.filter(
      (c) =>
        c.page === this.page() &&
        (!this.search().trim() ||
          (c.name + " " + c.id)
            .toLowerCase()
            .includes(this.search().trim().toLowerCase())),
    ),
  );
  entry = computed(() => DESIGN_CONTROLS.find((c) => c.id === this.selected()));
  dirty = computed(() => JSON.stringify(this.draft()) !== this.saved());
  patch = computed<DesignStyle>(() =>
    this.scope() === "global"
      ? this.draft().global
      : this.scope() === "page"
        ? this.draft().pages[this.page()] || {}
        : this.draft().instances[this.selected()] || {},
  );
  effective = computed(() =>
    resolveDesign(
      this.draft(),
      this.page(),
      this.scope() === "instance" ? this.selected() : undefined,
    ),
  );
  warnings = computed(() =>
    designWarnings(this.effective(), this.entry()?.kind),
  );
  colors = computed(() =>
    DESIGN_COLORS.filter(
      (key) =>
        this.scope() !== "instance" ||
        (this.entry()?.kind === "text"
          ? key === "text"
          : ![
              "background",
              "surface",
              "card",
              "primary",
              "secondary",
              "muted",
            ].includes(key)),
    ).map((key) => ({ key: key as StyleKey, name: COLOR_NAMES[key] })),
  );
  supportsBackground = computed(
    () =>
      this.scope() !== "instance" ||
      !["text", "image"].includes(this.entry()?.kind || ""),
  );
  visibleNumbers = computed(() =>
    this.numbers.filter(
      (field) =>
        field.group === this.group() &&
        (this.scope() !== "instance" ||
          field.key !== "height" ||
          ["button", "input", "tab", "switch", "progress", "slider"].includes(
            this.entry()?.kind || "",
          )) &&
        (field.key !== "iconSize" ||
          this.scope() !== "instance" ||
          !!this.entry()?.icon) &&
        (this.scope() !== "instance" ||
          this.entry()?.kind !== "text" ||
          [
            "fontSize",
            "fontWeight",
            "lineHeight",
            "letterSpacing",
            "marginY",
            "opacity",
            "duration",
          ].includes(field.key)),
    ),
  );
  constructor() {
    void this.load();
  }
  private authorized() {
    return !this.disposed && this.runtime.canManage();
  }
  async load() {
    if (!this.authorized()) {
      this.loading.set(false);
      this.error.set("Accesso riservato al Super Admin online.");
      return;
    }
    const generation = ++this.generation,
      id = this.auth.user()?.id;
    this.loading.set(true);
    this.error.set("");
    try {
      const state = (await this.auth.request(
        "design/studio",
      )) as DesignStudioState;
      if (
        !this.authorized() ||
        generation !== this.generation ||
        id !== this.auth.user()?.id
      )
        return;
      parseDesign(state.published.config);
      if (state.draft) parseDesign(state.draft.config);
      this.state.set(state);
      this.runtime.acceptPublished(state.published);
      this.draft.set(
        structuredClone(state.draft?.config || state.published.config),
      );
      this.saved.set(JSON.stringify(this.draft()));
      this.baseRevision = state.draft?.baseRevision ?? state.published.revision;
      this.draftVersion = state.draft?.version || 0;
      if (state.draft && state.draft.baseRevision !== state.published.revision)
        this.notice.set(
          "Questa bozza precede il tema pubblicato. Annullala per ripartire dalla revisione corrente.",
        );
    } catch (error) {
      this.report(error);
    } finally {
      if (generation === this.generation) this.loading.set(false);
    }
  }
  private report(error: unknown) {
    if (!this.disposed)
      this.error.set(
        error instanceof Error ? error.message : "Operazione non riuscita.",
      );
  }
  choosePage(value: string) {
    this.page.set(value as DesignPage);
    this.selected.set(
      value === "home"
        ? "home.stats.workouts"
        : DESIGN_CONTROLS.find((c) => c.page === value)?.id || "",
    );
    this.search.set("");
  }
  chooseControl(id: string) {
    this.selected.set(id);
    this.scope.set("instance");
  }
  toggleMobilePreview() {
    this.previewOnMobile.update((v) => !v);
    setTimeout(() => {
      if (!this.disposed && this.previewOnMobile())
        this.element.nativeElement
          .querySelector(".studio-preview-panel")
          ?.scrollIntoView({ block: "start" });
    }, 0);
  }
  has(key: StyleKey) {
    return Object.prototype.hasOwnProperty.call(this.patch(), key);
  }
  value(key: StyleKey) {
    return this.effective()[key];
  }
  color(key: StyleKey) {
    const value = this.value(key);
    return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value)
      ? value
      : "#00D9FF";
  }
  set(key: StyleKey, value: unknown) {
    if (!this.authorized() || this.busy()) return;
    const next = structuredClone(this.draft()),
      patch = { ...this.patch() };
    if (value === undefined) delete patch[key];
    else Object.assign(patch, { [key]: value });
    if (this.scope() === "global") next.global = patch;
    else if (this.scope() === "page") {
      if (Object.keys(patch).length) next.pages[this.page()] = patch;
      else delete next.pages[this.page()];
    } else {
      if (Object.keys(patch).length) next.instances[this.selected()] = patch;
      else delete next.instances[this.selected()];
    }
    try {
      this.draft.set(parseDesign(next));
      this.error.set("");
      this.notice.set("Modifiche visibili solo nell’anteprima.");
    } catch (error) {
      this.report(error);
    }
  }
  setNumber(key: StyleKey, value: string | number) {
    this.set(key, value === "" ? undefined : Number(value));
  }
  async resetScope() {
    if (
      !this.authorized() ||
      this.busy() ||
      !(await this.confirmation.ask({
        title: "Ripristina ereditarietà",
        message: "Rimuovere gli override di questo ambito?",
        detail:
          "Gli altri controlli e le altre pagine manterranno le loro impostazioni.",
        confirmLabel: "Ripristina",
        tone: "info",
      }))
    )
      return;
    const next = structuredClone(this.draft());
    if (this.scope() === "global") next.global = {};
    else if (this.scope() === "page") delete next.pages[this.page()];
    else delete next.instances[this.selected()];
    this.draft.set(next);
  }
  gradient = computed<DesignGradient>(
    () =>
      this.effective().gradient || {
        type: "linear",
        angle: 135,
        stops: [
          { color: "#00D9FF", offset: 0 },
          { color: "#0077FF", offset: 1 },
        ],
      },
  );
  gradientMode(value: string) {
    if (value === "none") {
      this.set("variant", "solid");
      return;
    }
    this.set("gradient", { ...this.gradient(), type: value });
    this.set("variant", "gradient");
  }
  gradientAngle(value: string) {
    this.set("gradient", { ...this.gradient(), angle: Number(value) });
  }
  gradientStop(index: number, key: "color" | "offset", value: string) {
    const gradient = structuredClone(this.gradient());
    Object.assign(gradient.stops[index], {
      [key]: key === "offset" ? Number(value) : value,
    });
    this.set("gradient", gradient);
  }
  addStop() {
    const gradient = structuredClone(this.gradient());
    if (gradient.stops.length >= 5) return;
    let index = 0;
    for (let i = 1; i < gradient.stops.length - 1; i++)
      if (
        gradient.stops[i + 1].offset - gradient.stops[i].offset >
        gradient.stops[index + 1].offset - gradient.stops[index].offset
      )
        index = i;
    gradient.stops.splice(index + 1, 0, {
      color: gradient.stops[index].color,
      offset:
        (gradient.stops[index].offset + gradient.stops[index + 1].offset) / 2,
    });
    this.set("gradient", gradient);
  }
  removeStop(index: number) {
    const gradient = structuredClone(this.gradient());
    if (index === 0 || index === gradient.stops.length - 1) return;
    gradient.stops.splice(index, 1);
    this.set("gradient", gradient);
  }
  paletteGradient(preset: DesignFactory) {
    return gradientCss(preset.gradient);
  }
  applyFactory(id: string) {
    if (!this.authorized() || this.busy()) return;
    this.draft.set({ ...structuredClone(DEFAULT_DESIGN), presetId: id });
    this.notice.set("Preset in anteprima. La pubblicazione richiede conferma.");
  }
  applySaved(preset: SavedDesignPreset) {
    if (!this.authorized() || this.busy()) return;
    this.draft.set(parseDesign(preset.config));
    this.notice.set("Preset personale in anteprima.");
  }
  async resetFactory() {
    if (
      await this.confirmation.ask({
        title: "Ripristina preset originale",
        message:
          "Rimuovere tutte le personalizzazioni e ripristinare il factory selezionato?",
        confirmLabel: "Ripristina originale",
        tone: "info",
      })
    )
      this.applyFactory(this.draft().presetId);
  }
  async resetDefault() {
    if (
      await this.confirmation.ask({
        title: "Ripristina default",
        message: "Tornare all’aspetto dell’app precedente al Design Studio?",
        detail:
          "Le preferenze personali esistenti restano disponibili. Il ripristino viene preparato in anteprima.",
        confirmLabel: "Ripristina default",
        tone: "info",
      })
    )
      this.applyFactory("app_default");
  }
  toggleEnabled(value: boolean) {
    if (this.authorized() && !this.busy())
      this.draft.update((d) => ({ ...d, enabled: value }));
  }
  private async persistDraft() {
    const value = (await this.auth.request("design/draft", {
      config: parseDesign(this.draft()),
      baseRevision: this.baseRevision,
      version: this.draftVersion,
    })) as DesignDraft;
    if (!this.authorized()) return false;
    this.draftVersion = value.version;
    this.saved.set(JSON.stringify(value.config));
    this.state.update((s) => (s ? { ...s, draft: value } : s));
    return true;
  }
  async saveDraft() {
    if (!this.authorized() || this.busy()) return;
    this.busy.set(true);
    this.error.set("");
    try {
      if (await this.persistDraft())
        this.notice.set(
          "Bozza privata salvata sul server. Gli utenti vedono ancora il tema pubblicato.",
        );
    } catch (error) {
      this.report(error);
    } finally {
      this.busy.set(false);
    }
  }
  async publish() {
    if (!this.authorized() || this.busy() || !this.state()) return;
    if (
      !(await this.confirmation.ask({
        title: "Pubblica il tema",
        message:
          "Applicare questa configurazione a tutti gli utenti autenticati di GymTrack?",
        detail:
          "L’operazione viene registrata e potrai ripristinare una revisione precedente.",
        confirmLabel: "Pubblica per tutti",
        tone: "info",
      }))
    )
      return;
    if (!this.authorized() || this.busy()) return;
    this.busy.set(true);
    this.error.set("");
    try {
      if (!(await this.persistDraft())) return;
      const published = await this.auth.request("design/publish", {
        version: this.draftVersion,
        expectedRevision: this.baseRevision,
        confirmed: true,
      });
      if (!this.authorized()) return;
      this.runtime.acceptPublished(published);
      this.notice.set(
        "Tema pubblicato. La cronologia conserva la revisione precedente.",
      );
      await this.load();
    } catch (error) {
      this.report(error);
    } finally {
      this.busy.set(false);
    }
  }
  async cancel() {
    if (
      !this.authorized() ||
      this.busy() ||
      !(await this.confirmation.ask({
        title: "Annulla la bozza",
        message: "Scartare le modifiche e tornare al tema pubblicato?",
        confirmLabel: "Scarta bozza",
        tone: "danger",
      }))
    )
      return;
    this.busy.set(true);
    try {
      await this.auth.request("design/discard", { version: this.draftVersion });
      await this.load();
      this.notice.set("Bozza rimossa. Anteprima del tema pubblicato.");
    } catch (error) {
      this.report(error);
    } finally {
      this.busy.set(false);
    }
  }
  async reload() {
    if (
      !this.dirty() ||
      (await this.confirmation.ask(
        "Ricaricare e scartare le modifiche non salvate?",
      ))
    )
      await this.load();
  }
  async savePreset() {
    if (!this.authorized() || this.busy()) return;
    this.busy.set(true);
    this.error.set("");
    try {
      const preset = await this.auth.request("design/presets", {
        name: this.presetName,
        config: parseDesign(this.draft()),
      });
      if (!this.authorized()) return;
      this.state.update((s) =>
        s ? { ...s, presets: [preset, ...s.presets] } : s,
      );
      this.presetName = "";
      this.notice.set("Copia personale del preset salvata.");
    } catch (error) {
      this.report(error);
    } finally {
      this.busy.set(false);
    }
  }
  async renamePreset(preset: SavedDesignPreset) {
    if (!this.authorized() || this.busy()) return;
    this.busy.set(true);
    try {
      await this.auth.request("design/rename", {
        id: preset.id,
        name: this.renameName,
        version: preset.version,
      });
      if (!this.authorized()) return;
      const name = this.renameName.trim();
      this.state.update((s) =>
        s
          ? {
              ...s,
              presets: s.presets.map((p) =>
                p.id === preset.id ? { ...p, name, version: p.version + 1 } : p,
              ),
            }
          : s,
      );
      this.renameName = "";
    } catch (error) {
      this.report(error);
    } finally {
      this.busy.set(false);
    }
  }
  async exportConfig() {
    if (!this.authorized() || this.busy()) return;
    this.busy.set(true);
    try {
      const exported = await this.auth.request("design/export", {
        config: parseDesign(this.draft()),
      });
      if (!this.authorized()) return;
      const url = URL.createObjectURL(
          new Blob([JSON.stringify(exported, null, 2)], {
            type: "application/json",
          }),
        ),
        link = document.createElement("a");
      link.href = url;
      link.download = "gt-design-studio.json";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      this.report(error);
    } finally {
      this.busy.set(false);
    }
  }
  async importConfig(event: Event) {
    const input = event.target as HTMLInputElement,
      file = input.files?.[0];
    input.value = "";
    if (!file || !this.authorized() || this.busy()) return;
    try {
      if (file.size > 66560)
        throw Error("Il preset supera il limite di 65 KB.");
      const value = JSON.parse(await file.text());
      if (!this.authorized() || this.disposed) return;
      if (
        !value ||
        Object.keys(value).some(
          (k) => !["format", "schemaVersion", "config"].includes(k),
        ) ||
        value.format !== "gt-design-studio" ||
        value.schemaVersion !== 1
      )
        throw Error("Formato di preset non supportato.");
      this.draft.set(parseDesign(value.config));
      this.notice.set(
        "Preset importato in anteprima. Non è ancora pubblicato.",
      );
      this.error.set("");
    } catch (error) {
      this.report(error);
    }
  }
  async rollback(revision: number) {
    if (
      !this.authorized() ||
      this.busy() ||
      !this.state() ||
      !(await this.confirmation.ask({
        title: "Ripristina revisione",
        message: `Pubblicare nuovamente la revisione ${revision}?`,
        detail:
          "Verrà creata una nuova revisione. Gli allenamenti restano invariati.",
        confirmLabel: "Ripristina e pubblica",
        tone: "info",
      }))
    )
      return;
    this.busy.set(true);
    try {
      const published = await this.auth.request("design/rollback", {
        revision,
        expectedRevision: this.state()!.published.revision,
        confirmed: true,
      });
      if (!this.authorized()) return;
      this.runtime.acceptPublished(published);
      this.notice.set("Revisione ripristinata e registrata.");
      await this.load();
    } catch (error) {
      this.report(error);
    } finally {
      this.busy.set(false);
    }
  }
  date(value: number) {
    return new Date(value).toLocaleString("it-IT");
  }
  pageName() {
    return this.pages.find((p) => p.id === this.page())?.name || this.page();
  }
  canLeave() {
    return (
      !this.dirty() ||
      this.confirmation.ask({
        title: "Bozza non salvata",
        message: "Uscire senza salvare queste modifiche?",
        detail:
          "Puoi restare e usare Salva bozza per ritrovarle al prossimo accesso.",
        confirmLabel: "Esci senza salvare",
        tone: "danger",
      })
    );
  }
  ngOnDestroy() {
    this.disposed = true;
    this.generation++;
  }
}
