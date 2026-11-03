import type { DesignFactory } from "./design-system.js";
export interface ApprovedThemePalette {
  id: string;
  name: string;
  background: string;
  card: string;
  accent: string;
  text: string;
  muted: string;
  buttonText: string;
  tone: "dark";
  secondary?: string;
  tertiary?: string;
  buttonStart?: string;
  buttonEnd?: string;
  finish?: "satin";
}
export const APPROVED_THEME_PALETTES: readonly ApprovedThemePalette[];
export const APPROVED_THEME_IDS: readonly string[];
export const ORIGINAL_THEME_IDS: readonly string[];
export const APPROVED_DESIGN_PRESETS: readonly DesignFactory[];
