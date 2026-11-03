import { FACTORY_PRESETS } from "./design-presets.js";
import {
  APPROVED_DESIGN_PRESETS,
  APPROVED_THEME_IDS,
} from "./approved-palettes.js";
export { FACTORY_PRESETS };
export { APPROVED_DESIGN_PRESETS };
export const ALL_DESIGN_PRESETS = Object.freeze([
  ...APPROVED_DESIGN_PRESETS,
  ...FACTORY_PRESETS,
]);

export const DESIGN_SCHEMA_VERSION = 1;
export const MAX_DESIGN_BYTES = 65536;
export const DESIGN_PAGES = Object.freeze([
  { id: "home", name: "Home", path: "/" },
  { id: "training", name: "Allenamenti", path: "/piani" },
  { id: "history", name: "Storico allenamenti", path: "/allenamenti" },
  { id: "progress", name: "Progressi", path: "/progressi" },
  { id: "profile", name: "Profilo", path: "/profilo" },
  { id: "navigation", name: "Navigazione", path: "/" },
]);
// These identities describe existing controls, never routes, entity keys or handlers.
const designControlEntry = (id, page, kind, name, extra = {}) =>
  Object.freeze({ id, page, kind, name, ...extra });
export const DESIGN_CONTROLS = Object.freeze([
  designControlEntry("home.title", "home", "text", "Titolo Home"),
  designControlEntry(
    "home.actions.resume",
    "home",
    "button",
    "Riprendi allenamento",
  ),
  designControlEntry(
    "home.actions.schedule",
    "home",
    "button",
    "Apri programmazione",
  ),
  designControlEntry(
    "home.actions.viewSession",
    "home",
    "button",
    "Vedi sessione",
  ),
  designControlEntry("home.actions.preview", "home", "button", "Vedi scheda"),
  designControlEntry(
    "home.actions.create",
    "home",
    "button",
    "Crea la tua scheda",
    { label: "Crea la tua scheda", icon: "eye" },
  ),
  designControlEntry(
    "home.shortcuts.calendar",
    "home",
    "button",
    "Calendario",
    { label: "Calendario", icon: "calendar" },
  ),
  designControlEntry(
    "home.shortcuts.rest",
    "home",
    "button",
    "Giorno di riposo",
    { label: "Giorno di riposo", icon: "moon" },
  ),
  designControlEntry("home.shortcuts.exercises", "home", "button", "Esercizi", {
    label: "Esercizi",
    icon: "weight",
  }),
  designControlEntry("home.week", "home", "card", "La tua settimana"),
  designControlEntry(
    "home.week.days",
    "home",
    "calendar",
    "Calendario settimanale (contenitore)",
  ),
  designControlEntry(
    "home.stats.workouts",
    "home",
    "button",
    "Allenamenti · riepilogo",
    { label: "Allenamenti", icon: "weight" },
  ),
  designControlEntry("home.stats.time", "home", "button", "Tempo totale", {
    label: "Tempo totale",
    icon: "clock",
  }),
  designControlEntry("home.stats.volume", "home", "button", "Volume", {
    label: "Volume",
    icon: "chart",
  }),
  designControlEntry("home.goals", "home", "progress", "Obiettivo settimanale"),
  designControlEntry("home.health", "home", "card", "Obiettivo e benessere"),
  designControlEntry(
    "home.dumbbell",
    "home",
    "image",
    "Immagine manubrio (nel benessere)",
  ),
  designControlEntry(
    "home.clientView",
    "home",
    "switch",
    "Visualizza come cliente (contenitore)",
  ),
  designControlEntry("training.title", "training", "text", "Titolo Allenati"),
  designControlEntry("training.newPlan", "training", "button", "Nuovo piano"),
  designControlEntry("training.tabs.today", "training", "tab", "Oggi", {
    label: "Oggi",
    icon: "calendar",
  }),
  designControlEntry("training.tabs.plans", "training", "tab", "Piani", {
    label: "Piani",
    icon: "layers",
  }),
  designControlEntry("training.tabs.history", "training", "button", "Storico", {
    label: "Storico",
    icon: "clock",
  }),
  designControlEntry("training.today", "training", "card", "Seduta di oggi"),
  designControlEntry(
    "training.actions.resume",
    "training",
    "button",
    "Riprendi allenamento",
  ),
  designControlEntry(
    "training.actions.open",
    "training",
    "button",
    "Apri la seduta",
  ),
  designControlEntry(
    "training.actions.calendar",
    "training",
    "button",
    "Cambia programmazione",
  ),
  designControlEntry(
    "training.plans",
    "training",
    "list",
    "Elenco piani · template contenitore",
  ),
  designControlEntry("history.train", "history", "button", "Allenati", {
    label: "Allenati",
    icon: "plus",
  }),
  designControlEntry(
    "history.filters",
    "history",
    "container",
    "Filtri dello storico",
  ),
  designControlEntry("history.plan", "history", "input", "Filtro piano"),
  designControlEntry("progress.title", "progress", "text", "Titolo Progressi"),
  designControlEntry(
    "progress.exerciseChart",
    "progress",
    "chart",
    "Grafico per esercizio (contenitore)",
  ),
  designControlEntry(
    "progress.records",
    "progress",
    "card",
    "Record personali",
  ),
  designControlEntry(
    "progress.search",
    "progress",
    "input",
    "Ricerca esercizi",
  ),
  designControlEntry(
    "progress.exercise",
    "progress",
    "input",
    "Selezione esercizio",
  ),
  designControlEntry("progress.filters", "progress", "button", "Filtri record"),
  designControlEntry(
    "progress.info",
    "progress",
    "card",
    "Informazioni sui record",
  ),
  designControlEntry(
    "progress.weeklyChart",
    "progress",
    "chart",
    "Volume settimanale (contenitore)",
  ),
  designControlEntry(
    "progress.sessionsBadge",
    "progress",
    "badge",
    "Badge sedute nel periodo",
  ),
  designControlEntry("profile.title", "profile", "text", "Titolo Profilo"),
  designControlEntry("profile.identity", "profile", "card", "Scheda profilo"),
  designControlEntry("profile.goals", "profile", "button", "Obiettivi", {
    label: "Obiettivi",
    icon: "trophy",
  }),
  designControlEntry(
    "profile.measurements",
    "profile",
    "button",
    "Misurazioni corporee",
    { label: "Misurazioni corporee", icon: "activity" },
  ),
  designControlEntry("profile.settings", "profile", "button", "Impostazioni", {
    label: "Impostazioni",
    icon: "settings",
  }),
  designControlEntry(
    "profile.security",
    "profile",
    "button",
    "Account e accessi",
    { label: "Account e accessi", icon: "shield" },
  ),
  designControlEntry(
    "profile.theme",
    "profile",
    "button",
    "Tema e personalizzazione",
    { label: "Tema e personalizzazione", icon: "palette" },
  ),
  designControlEntry("profile.logout", "profile", "button", "Esci dall’app"),
  designControlEntry(
    "profile.glowSlider",
    "profile",
    "slider",
    "Intensità glow (in Tema)",
  ),
  ...["home", "training", "progress", "profile"].map((name, index) =>
    designControlEntry(
      "navigation." + name,
      "navigation",
      "tab",
      ["Home", "Allenamenti", "Progressi", "Profilo"][index],
    ),
  ),
]);
export const DESIGN_ICONS = Object.freeze([
  "home",
  "weight",
  "calendar",
  "chart",
  "user",
  "eye",
  "moon",
  "clock",
  "activity",
  "trophy",
  "settings",
  "shield",
  "palette",
  "layers",
  "plus",
  "heart",
  "bolt",
  "plans",
]);
export const DESIGN_NUMBERS = Object.freeze({
  radius: [0, 40, 1],
  height: [44, 160, 1],
  paddingX: [0, 24, 1],
  paddingY: [0, 24, 1],
  marginY: [0, 24, 1],
  borderWidth: [0, 4, 1],
  fontSize: [12, 32, 1],
  fontWeight: [400, 800, 100],
  lineHeight: [1.2, 2, 0.1],
  letterSpacing: [0, 2, 0.1],
  iconSize: [16, 40, 1],
  opacity: [0.9, 1, 0.01],
  glowIntensity: [0, 1, 0.05],
  glowBlur: [0, 32, 1],
  glowSpread: [0, 8, 1],
  shadowBlur: [0, 32, 1],
  shadowOpacity: [0, 0.5, 0.05],
  blur: [0, 12, 1],
  duration: [0, 400, 10],
});
export const DESIGN_COLORS = Object.freeze([
  "background",
  "surface",
  "card",
  "primary",
  "secondary",
  "text",
  "muted",
  "border",
  "fill",
  "glowColor",
  "shadowColor",
]);
export const DEFAULT_DESIGN = Object.freeze({
  schemaVersion: 1,
  enabled: true,
  presetId: "app_default",
  global: Object.freeze({}),
  pages: Object.freeze({}),
  instances: Object.freeze({}),
});
const designOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
const designRecord = (value) =>
  !!value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
const designShapeKeys = (value, allowed) =>
  designRecord(value) &&
  Object.keys(value).every((key) => allowed.includes(key));
const designHex = (value) =>
  typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
export function validGradient(value) {
  return (
    designShapeKeys(value, ["type", "angle", "stops"]) &&
    ["linear", "radial"].includes(value.type) &&
    Number.isFinite(value.angle) &&
    value.angle >= 0 &&
    value.angle <= 360 &&
    Array.isArray(value.stops) &&
    value.stops.length >= 2 &&
    value.stops.length <= 5 &&
    value.stops.every(
      (stop, index) =>
        designShapeKeys(stop, ["color", "offset"]) &&
        designHex(stop.color) &&
        Number.isFinite(stop.offset) &&
        stop.offset >= 0 &&
        stop.offset <= 1 &&
        (index === 0
          ? stop.offset === 0
          : stop.offset > value.stops[index - 1].offset),
    ) &&
    value.stops.at(-1).offset === 1
  );
}
export function validStyle(value, entry) {
  if (!designRecord(value)) return false;
  return Object.entries(value).every(([key, v]) => {
    if (DESIGN_COLORS.includes(key)) return designHex(v);
    if (designOwn(DESIGN_NUMBERS, key)) {
      const [min, max] = DESIGN_NUMBERS[key];
      return (
        typeof v === "number" && Number.isFinite(v) && v >= min && v <= max
      );
    }
    if (key === "gradient") return validGradient(v);
    if (key === "variant")
      return ["solid", "outline", "glass", "neon", "gradient"].includes(v);
    if (key === "fontFamily")
      return ["system", "sans", "serif", "mono"].includes(v);
    if (key === "motion") return typeof v === "boolean";
    if (key === "label")
      return (
        !!entry?.label &&
        typeof v === "string" &&
        v.trim().length > 0 &&
        v.length <= 60 &&
        !/[\u0000-\u001F\u007F<>]/.test(v)
      );
    if (key === "icon") return !!entry?.icon && DESIGN_ICONS.includes(v);
    return false;
  });
}
export function validDesign(value) {
  try {
    return (
      designShapeKeys(value, [
        "schemaVersion",
        "enabled",
        "presetId",
        "global",
        "pages",
        "instances",
      ]) &&
      value.schemaVersion === 1 &&
      typeof value.enabled === "boolean" &&
      (value.presetId === "app_default" ||
        ALL_DESIGN_PRESETS.some((p) => p.id === value.presetId)) &&
      validStyle(value.global) &&
      designRecord(value.pages) &&
      Object.entries(value.pages).every(
        ([id, style]) =>
          DESIGN_PAGES.some((p) => p.id === id) && validStyle(style),
      ) &&
      designRecord(value.instances) &&
      Object.entries(value.instances).every(([id, style]) => {
        const entry = DESIGN_CONTROLS.find((c) => c.id === id);
        return !!entry && validStyle(style, entry);
      }) &&
      new TextEncoder().encode(JSON.stringify(value)).byteLength <=
        MAX_DESIGN_BYTES
    );
  } catch {
    return false;
  }
}
export function parseDesign(value) {
  if (!validDesign(value))
    throw Error("Configurazione Design Studio non valida o non supportata.");
  return JSON.parse(JSON.stringify(value));
}
export function presetStyle(id) {
  const p = ALL_DESIGN_PRESETS.find((p) => p.id === id);
  if (!p) return {};
  return {
    background: p.background,
    surface: p.surface,
    card: p.card,
    primary: p.primary,
    secondary: p.secondary,
    text: p.text,
    muted: p.textMuted,
    border: p.border,
    glowColor: p.glow,
    gradient: p.gradient,
    glowIntensity: p.effects.glowIntensity,
    glowBlur: p.effects.glowBlur,
    shadowOpacity: p.effects.shadowOpacity,
    blur: p.effects.backgroundBlur,
    motion: p.effects.motionEnabled,
    fontFamily: p.typography.family,
  };
}
export function resolveDesign(config, page, id) {
  if (!config.enabled) return {};
  const base = presetStyle(config.presetId);
  if (APPROVED_THEME_IDS.includes(config.presetId)) {
    const entry = DESIGN_CONTROLS.find((control) => control.id === id);
    const primary = [
      "home.actions.schedule",
      "home.actions.resume",
      "training.actions.open",
      "training.actions.resume",
      "history.train",
    ].includes(id);
    if (!entry || entry.kind === "text") {
      base.glowIntensity = 0;
      base.shadowOpacity = 0;
    } else if (!primary) {
      base.glowIntensity = 0;
      base.shadowOpacity = 0.12;
      base.variant = "glass";
      base.fill = base.card;
    }
    if (primary) {
      base.variant = "gradient";
      base.fill = base.primary;
    }
    // The weekly section groups its title and calendar; the calendar owns the surface.
    if (id === "home.week") {
      delete base.card;
      delete base.fill;
      delete base.variant;
      base.glowIntensity = 0;
      base.shadowOpacity = 0;
    }
  }
  const overrides = {
    ...config.global,
    ...config.pages[page],
    ...(id ? config.instances[id] : {}),
  };
  return {
    ...base,
    ...overrides,
    ...(overrides.fill !== undefined &&
    overrides.variant === undefined &&
    overrides.gradient === undefined
      ? { variant: "solid" }
      : {}),
  };
}
export function resolvePageDesign(config, page) {
  const style = resolveDesign(config, page);
  // A factory gradient belongs to primary controls. Page backgrounds keep the
  // factory's exact background token unless an explicit page/global edit wins.
  if (
    !config.global.gradient &&
    !config.pages[page]?.gradient &&
    config.global.variant !== "gradient" &&
    config.pages[page]?.variant !== "gradient"
  )
    delete style.gradient;
  return style;
}
export function designPageForPath(url) {
  const path = url.split(/[?#]/)[0];
  return (
    DESIGN_PAGES.find((p) => p.id !== "navigation" && p.path === path)?.id ||
    "other"
  );
}
export function gradientCss(gradient) {
  const stops = gradient.stops
    .map((s) => `${s.color} ${Math.round(s.offset * 10000) / 100}%`)
    .join(", ");
  return gradient.type === "radial"
    ? `radial-gradient(circle at center, ${stops})`
    : `linear-gradient(${gradient.angle}deg, ${stops})`;
}
const designLuminance = (color) =>
  [1, 3, 5]
    .map((i) => parseInt(color.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    .reduce((a, b, i) => a + b * [0.2126, 0.7152, 0.0722][i], 0);
export function designContrast(a, b) {
  const x = designLuminance(a),
    y = designLuminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
export function readableDesignInk(preferred, surfaces) {
  const score = (color) =>
    Math.min(...surfaces.map((bg) => designContrast(color, bg)));
  if (designHex(preferred) && score(preferred) >= 4.5) return preferred;
  return score("#000000") > score("#FFFFFF") ? "#000000" : "#FFFFFF";
}
export function designWarnings(style, kind = "button") {
  const fill =
    style.fill ||
    (["button", "tab"].includes(kind) ? style.primary : style.card) ||
    style.background;
  const surfaces =
    style.gradient && style.variant !== "outline"
      ? style.gradient.stops.map((s) => s.color)
      : fill
        ? [fill]
        : [];
  return style.text &&
    surfaces.some((bg) => designContrast(style.text, bg) < 4.5)
    ? [
        "Il testo verrà adattato per mantenere il contrasto. Se necessario il gradiente userà il colore pieno.",
      ]
    : [];
}
/** Pure allowlisted renderer: configuration cannot become selectors, scripts or URLs. */
export function designStyles(style, kind = "page") {
  const css = {};
  const set = (key, value) => {
    if (value !== undefined) css[key] = String(value);
  };
  const tokens = {
    background: "--bg",
    surface: "--raised",
    card: "--card",
    primary: "--accent",
    secondary: "--theme-secondary",
    text: "--text",
    muted: "--muted",
    border: "--line",
  };
  for (const [key, variable] of Object.entries(tokens))
    set(variable, style[key]);
  if (style.secondary) set("--theme-tertiary", style.secondary);
  if (style.card) set("--nav-bg", style.card);
  if (style.primary) {
    set("--theme-button-start", style.primary);
    set("--theme-button-end", style.secondary || style.primary);
    set("--blue", style.primary);
    set("--accent-text", style.primary);
    set(
      "--accent-soft",
      `color-mix(in srgb, ${style.primary} 15%, var(--card))`,
    );
    set("--accent-ink", readableDesignInk(style.text, [style.primary]));
    set("--cta-start", style.primary);
    set("--cta-end", style.secondary || style.primary);
    set("--cta-ink", readableDesignInk(style.text, [style.primary]));
  }
  if (style.background)
    set(
      "color-scheme",
      designContrast(style.background, "#000000") >=
        designContrast(style.background, "#FFFFFF")
        ? "light"
        : "dark",
    );
  if (style.text && style.background) {
    const surfaces = [
      style.background,
      style.card || style.background,
      style.surface || style.card || style.background,
    ];
    set("--text", readableDesignInk(style.text, surfaces));
    set("--muted", readableDesignInk(style.muted || style.text, surfaces));
  }
  if (Object.keys(tokens).some((key) => style[key] !== undefined)) {
    set("--ref-surface", "linear-gradient(160deg, var(--raised), var(--card))");
    set(
      "--ref-surface-soft",
      "linear-gradient(155deg, var(--raised), var(--card))",
    );
    set("--ref-violet-surface", "var(--card)");
    set("--ref-line", "var(--line)");
    set("--ref-blue", "var(--accent)");
    set("--ref-primary-top", "var(--accent)");
    set("--ref-primary-bottom", "var(--accent)");
    set("--ref-primary-ink", "var(--accent-ink)");
    set("--ref-tab-top", "var(--accent)");
    set("--ref-tab-bottom", "var(--card)");
  }
  if (style.radius !== undefined) set("--radius", style.radius + "px");
  if (style.glowIntensity !== undefined)
    set("--neon-glow", style.glowIntensity);
  const interactive = [
    "button",
    "tab",
    "input",
    "switch",
    "progress",
    "slider",
  ].includes(kind);
  if (kind === "slider") set("accent-color", style.fill || style.primary);
  const fill =
    kind === "page"
      ? style.background
      : style.fill ||
        (interactive
          ? style.primary
          : kind === "text"
            ? undefined
            : style.card);
  let surfaces = fill ? [fill] : [];
  const useGradient =
    style.gradient &&
    style.variant !== "solid" &&
    style.variant !== "outline" &&
    style.variant !== "glass" &&
    (kind === "page" || interactive || style.variant === "gradient");
  let ink = style.text;
  if (useGradient) surfaces = style.gradient.stops.map((s) => s.color);
  if (surfaces.length) ink = readableDesignInk(ink, surfaces);
  const safeGradient =
    useGradient && surfaces.every((bg) => designContrast(ink, bg) >= 4.5);
  const fallbackFill =
    fill || (useGradient ? style.gradient.stops[0].color : undefined);
  set("background", safeGradient ? gradientCss(style.gradient) : fallbackFill);
  if (fallbackFill && !safeGradient)
    ink = readableDesignInk(style.text, [fallbackFill]);
  set("color", ink);
  if (ink && kind !== "page") {
    set("--text", ink);
    set("--muted", ink);
  }
  set(
    "border-radius",
    style.radius === undefined ? undefined : style.radius + "px",
  );
  if (interactive && style.height !== undefined)
    set("min-height", style.height + "px");
  for (const [key, props] of Object.entries({
    paddingX: ["padding-left", "padding-right"],
    paddingY: ["padding-top", "padding-bottom"],
    marginY: ["margin-top", "margin-bottom"],
  }))
    for (const prop of props)
      set(prop, style[key] === undefined ? undefined : style[key] + "px");
  if (style.borderWidth !== undefined) {
    set("border-width", style.borderWidth + "px");
    set("border-style", "solid");
  }
  set("border-color", style.border);
  // CSS applies this only to enabled controls; the original disabled state wins.
  set("--design-opacity", style.opacity);
  set(
    "font-size",
    style.fontSize === undefined ? undefined : style.fontSize + "px",
  );
  set("font-weight", style.fontWeight);
  set("line-height", style.lineHeight);
  set(
    "letter-spacing",
    style.letterSpacing === undefined ? undefined : style.letterSpacing + "px",
  );
  const fonts = {
    system: "system-ui, sans-serif",
    sans: "Arial, sans-serif",
    serif: "Georgia, serif",
    mono: "ui-monospace, monospace",
  };
  set("font-family", fonts[style.fontFamily]);
  set(
    "--design-icon-size",
    style.iconSize === undefined ? undefined : style.iconSize + "px",
  );
  if (style.blur !== undefined) set("backdrop-filter", `blur(${style.blur}px)`);
  const glow = style.glowIntensity ?? (style.variant === "neon" ? 0.35 : 0);
  if (
    style.glowIntensity !== undefined ||
    style.shadowOpacity !== undefined ||
    style.variant === "neon"
  ) {
    const shadows = [];
    if (glow)
      shadows.push(
        `0 0 ${style.glowBlur ?? 16}px ${style.glowSpread ?? 0}px color-mix(in srgb, ${style.glowColor || style.primary || "#00D9FF"} ${glow * 100}%, transparent)`,
      );
    if (style.shadowOpacity)
      shadows.push(
        `0 4px ${style.shadowBlur ?? 16}px color-mix(in srgb, ${style.shadowColor || "#000000"} ${style.shadowOpacity * 100}%, transparent)`,
      );
    set("box-shadow", shadows.join(", ") || "none");
  }
  if (style.variant === "outline") {
    set("background", style.background || "var(--bg)");
    set(
      "color",
      readableDesignInk(style.text, [style.background || "#040C19"]),
    );
    set(
      "border",
      "1px solid " + (style.border || style.primary || "var(--line)"),
    );
  }
  if (style.variant === "glass") {
    const glassFill = style.fill || style.card;
    if (glassFill) {
      const tint = style.primary || "#FFFFFF";
      const top =
        "#" +
        [1, 3, 5]
          .map((i) =>
            Math.round(
              parseInt(glassFill.slice(i, i + 2), 16) * 0.88 +
                parseInt(tint.slice(i, i + 2), 16) * 0.12,
            )
              .toString(16)
              .padStart(2, "0"),
          )
          .join("");
      const glassInk = readableDesignInk(style.text, [glassFill, top]);
      const useGlassGradient =
        Math.min(
          designContrast(glassInk, glassFill),
          designContrast(glassInk, top),
        ) >= 4.5;
      set(
        "background",
        useGlassGradient
          ? `linear-gradient(150deg, ${top}, ${glassFill})`
          : glassFill,
      );
      const safeInk = useGlassGradient
        ? glassInk
        : readableDesignInk(style.text, [glassFill]);
      set("color", safeInk);
      set("--text", safeInk);
      set(
        "--muted",
        readableDesignInk(
          style.muted || safeInk,
          useGlassGradient ? [glassFill, top] : [glassFill],
        ),
      );
    } else set("background", "var(--card)");
    set("backdrop-filter", `blur(${style.blur ?? 8}px)`);
  }
  if (style.motion !== undefined || style.duration !== undefined)
    set(
      "--design-transition",
      style.motion === false
        ? "none"
        : `background-color ${style.duration ?? 160}ms ease, border-color ${style.duration ?? 160}ms ease, box-shadow ${style.duration ?? 160}ms ease`,
    );
  return css;
}
