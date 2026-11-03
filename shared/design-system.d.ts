export type DesignPage =
  "home" | "training" | "history" | "progress" | "profile" | "navigation";
export interface DesignGradient {
  type: "linear" | "radial";
  angle: number;
  stops: { color: string; offset: number }[];
}
export interface DesignStyle {
  background?: string;
  surface?: string;
  card?: string;
  primary?: string;
  secondary?: string;
  text?: string;
  muted?: string;
  border?: string;
  fill?: string;
  glowColor?: string;
  shadowColor?: string;
  radius?: number;
  height?: number;
  paddingX?: number;
  paddingY?: number;
  marginY?: number;
  borderWidth?: number;
  fontSize?: number;
  fontWeight?: number;
  lineHeight?: number;
  letterSpacing?: number;
  iconSize?: number;
  opacity?: number;
  glowIntensity?: number;
  glowBlur?: number;
  glowSpread?: number;
  shadowBlur?: number;
  shadowOpacity?: number;
  blur?: number;
  duration?: number;
  gradient?: DesignGradient;
  variant?: "solid" | "outline" | "glass" | "neon" | "gradient";
  fontFamily?: "system" | "sans" | "serif" | "mono";
  motion?: boolean;
  label?: string;
  icon?: string;
}
export interface DesignConfig {
  schemaVersion: 1;
  enabled: boolean;
  presetId: string;
  global: DesignStyle;
  pages: Partial<Record<DesignPage, DesignStyle>>;
  instances: Record<string, DesignStyle>;
}
export interface DesignControl {
  id: string;
  page: DesignPage;
  kind: string;
  name: string;
  label?: string;
  icon?: string;
}
export interface DesignFactory {
  id: string;
  name: string;
  background: string;
  surface: string;
  card: string;
  primary: string;
  secondary: string;
  text: string;
  textMuted: string;
  border: string;
  glow: string;
  onPrimary: string;
  schemaVersion: 1;
  gradient: DesignGradient;
  effects: {
    glowIntensity: number;
    glowBlur: number;
    shadowOpacity: number;
    backgroundBlur: number;
    motionEnabled: boolean;
  };
  typography: { family: string; scale: number };
}
export const FACTORY_PRESETS: readonly DesignFactory[];
export const APPROVED_DESIGN_PRESETS: readonly DesignFactory[];
export const ALL_DESIGN_PRESETS: readonly DesignFactory[];
export const DESIGN_SCHEMA_VERSION: 1;
export const MAX_DESIGN_BYTES: number;
export const DESIGN_PAGES: readonly {
  id: DesignPage;
  name: string;
  path: string;
}[];
export const DESIGN_CONTROLS: readonly DesignControl[];
export const DESIGN_ICONS: readonly string[];
export const DESIGN_COLORS: readonly string[];
export const DESIGN_NUMBERS: Readonly<
  Record<string, readonly [number, number, number]>
>;
export const DEFAULT_DESIGN: DesignConfig;
export function validDesign(value: unknown): value is DesignConfig;
export function parseDesign(value: unknown): DesignConfig;
export function validStyle(
  value: unknown,
  entry?: DesignControl,
): value is DesignStyle;
export function validGradient(value: unknown): value is DesignGradient;
export function presetStyle(id: string): DesignStyle;
export function resolveDesign(
  config: DesignConfig,
  page: string,
  id?: string,
): DesignStyle;
export function resolvePageDesign(
  config: DesignConfig,
  page: string,
): DesignStyle;
export function designPageForPath(url: string): string;
export function gradientCss(gradient: DesignGradient): string;
export function designContrast(a: string, b: string): number;
export function readableDesignInk(
  preferred: string | undefined,
  surfaces: string[],
): string;
export function designWarnings(style: DesignStyle, kind?: string): string[];
export function designStyles(
  style: DesignStyle,
  kind?: string,
): Record<string, string>;
