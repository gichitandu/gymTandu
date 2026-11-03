/** Eight palettes approved from the comparison boards. Existing theme IDs are preserved. */
function freezeApprovedPalette(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freezeApprovedPalette);
    Object.freeze(value);
  }
  return value;
}
export const APPROVED_THEME_PALETTES = freezeApprovedPalette([
  {
    id: "blu-azzurro",
    name: "Blu Azzurro",
    background: "#040C19",
    card: "#0C2036",
    accent: "#0DD9FF",
    text: "#F1FBFF",
    muted: "#A8C3D8",
    buttonText: "#031927",
    tone: "dark",
  },
  {
    id: "viola-neon",
    name: "Viola Neon",
    background: "#151225",
    card: "#28223D",
    accent: "#CC70FF",
    text: "#F7F5FF",
    muted: "#B8BCD4",
    buttonText: "#160726",
    tone: "dark",
  },
  {
    id: "petrolio-lumina",
    name: "Petrolio Lumina",
    background: "#061A1D",
    card: "#11363B",
    accent: "#2FE3CB",
    text: "#F0FFFC",
    muted: "#A6CBC9",
    buttonText: "#032321",
    tone: "dark",
    secondary: "#0A9EA5",
    buttonStart: "#55E8D6",
    buttonEnd: "#159AAA",
    finish: "satin",
  },
  {
    id: "smeraldo-sport",
    name: "Smeraldo Sport",
    background: "#081911",
    card: "#16362A",
    accent: "#55D99C",
    text: "#F0FFF6",
    muted: "#ACCDBB",
    buttonText: "#062219",
    tone: "dark",
    secondary: "#139768",
    buttonStart: "#69E6B0",
    buttonEnd: "#1BA878",
    finish: "satin",
  },
  {
    id: "rubino-carbonio",
    name: "Rubino Carbonio",
    background: "#1B0D15",
    card: "#351D2B",
    accent: "#F47A9F",
    text: "#FFF3F7",
    muted: "#D2ACBD",
    buttonText: "#2B0C1B",
    tone: "dark",
    secondary: "#B82E61",
    buttonStart: "#FF9BB9",
    buttonEnd: "#D84F80",
    finish: "satin",
  },
  {
    id: "oro-satinato",
    name: "Oro Satinato",
    background: "#14110B",
    card: "#2E281B",
    accent: "#E1BF71",
    text: "#FFF8E8",
    muted: "#CCBE9F",
    buttonText: "#241909",
    tone: "dark",
    secondary: "#9A743B",
    buttonStart: "#F6DEA0",
    buttonEnd: "#BC9350",
    finish: "satin",
  },
  {
    id: "argento-artico",
    name: "Argento Artico",
    background: "#0B1420",
    card: "#1A2B3D",
    accent: "#C1D6ED",
    text: "#F2F8FF",
    muted: "#ADBDD0",
    buttonText: "#11263A",
    tone: "dark",
    secondary: "#709FCB",
    buttonStart: "#D8E9F7",
    buttonEnd: "#8DAFCE",
    finish: "satin",
  },
  {
    id: "prugna-rose",
    name: "Prugna Rosé",
    background: "#1B1120",
    card: "#36243C",
    accent: "#E9A9D1",
    text: "#FFF4FC",
    muted: "#CDB3CA",
    buttonText: "#2A1025",
    tone: "dark",
    secondary: "#AD6EA5",
    buttonStart: "#F7C4DF",
    buttonEnd: "#BB7AAC",
    finish: "satin",
  },
]);
export const APPROVED_THEME_IDS = Object.freeze(
  APPROVED_THEME_PALETTES.map((p) => p.id),
);
export const ORIGINAL_THEME_IDS = Object.freeze(["blu-azzurro", "viola-neon"]);
function approvedPaletteMix(a, b, weight) {
  return (
    "#" +
    [1, 3, 5]
      .map((i) =>
        Math.round(
          parseInt(a.slice(i, i + 2), 16) * (1 - weight) +
            parseInt(b.slice(i, i + 2), 16) * weight,
        )
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
      .toUpperCase()
  );
}
export const APPROVED_DESIGN_PRESETS = freezeApprovedPalette(
  APPROVED_THEME_PALETTES.map((p) => ({
    id: p.id,
    name: p.name,
    schemaVersion: 1,
    background: p.background,
    surface: approvedPaletteMix(p.card, "#FFFFFF", 0.04),
    card: p.card,
    primary: p.accent,
    secondary: p.secondary || p.accent,
    text: p.text,
    textMuted: p.muted,
    border: approvedPaletteMix(p.card, p.accent, 0.25),
    glow: p.accent,
    onPrimary: p.id === "viola-neon" ? "#FFFFFF" : p.buttonText,
    gradient: {
      type: "linear",
      angle: 178,
      stops: [
        {
          offset: 0,
          color:
            p.buttonStart ||
            (p.id === "viola-neon"
              ? "#C53EE7"
              : approvedPaletteMix(p.accent, "#FFFFFF", 0.14)),
        },
        {
          offset: 1,
          color: p.buttonEnd || (p.id === "viola-neon" ? "#8502B7" : p.accent),
        },
      ],
    },
    effects: {
      glowIntensity: p.finish === "satin" ? 0.2 : 0.3,
      glowBlur: 16,
      shadowOpacity: 0.18,
      backgroundBlur: 0,
      motionEnabled: false,
    },
    typography: { family: "system", scale: 1 },
  })),
);
