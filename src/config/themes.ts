import type { CSSProperties } from "react";
import type { UIConfig } from "./uiSpace";
import { FONT_SIZE_PX, TYPE_SCALE } from "./shop";

/**
 * Complete colour token sets for both themes. Switching theme = swapping these CSS variables.
 * Every text/background pair used in the UI is checked for WCAG AA in tests/unit/themes.test.ts.
 */
export interface ThemeTokens {
  bg: string; // page background
  surface: string; // cards, drawers, modals
  surface2: string; // top bar, sidebar, subtle panels
  surfaceHover: string;
  border: string;
  fg: string; // body text
  muted: string; // secondary text
  accent: string; // primary buttons, links
  accentHover: string;
  onAccent: string; // text on accent
  accentSoft: string; // selected category background
  onAccentSoft: string; // text on accentSoft
  warning: string; // over-budget text
  warningSoft: string;
  star: string;
  starEmpty: string;
  focus: string;
  overlay: string;
  shadow: string;
}

export const THEME_TOKENS: Record<UIConfig["theme"], ThemeTokens> = {
  light: {
    bg: "#F5F6F8",
    surface: "#FFFFFF",
    surface2: "#FFFFFF",
    surfaceHover: "#F0F2F5",
    border: "#DFE3E8",
    fg: "#1C2430",
    muted: "#566070",
    accent: "#2B6A5A",
    accentHover: "#235A4C",
    onAccent: "#FFFFFF",
    accentSoft: "#E1EFEA",
    onAccentSoft: "#1D4D41",
    warning: "#B03A27",
    warningSoft: "#FBE9E5",
    star: "#C58612",
    starEmpty: "#D5DAE1",
    focus: "#2F6FDB",
    overlay: "rgba(20, 26, 34, 0.45)",
    shadow: "0 1px 2px rgba(20, 26, 34, 0.06), 0 2px 8px rgba(20, 26, 34, 0.05)",
  },
  dark: {
    bg: "#11151B",
    surface: "#1A2028",
    surface2: "#161B22",
    surfaceHover: "#222A34",
    border: "#2C3541",
    fg: "#E7EBF0",
    muted: "#A2ACB9",
    accent: "#69C1A6",
    accentHover: "#82CDB6",
    onAccent: "#0D1B17",
    accentSoft: "#1F3832",
    onAccentSoft: "#BDE7DA",
    warning: "#F2907D",
    warningSoft: "#3A2320",
    star: "#E3B04B",
    starEmpty: "#3A4450",
    focus: "#7FA8F5",
    overlay: "rgba(0, 0, 0, 0.6)",
    shadow: "0 1px 2px rgba(0, 0, 0, 0.35), 0 2px 10px rgba(0, 0, 0, 0.25)",
  },
};

/** Pairs [foreground token, background token] that carry text and must reach 4.5:1. */
export const TEXT_PAIRS: [keyof ThemeTokens, keyof ThemeTokens][] = [
  ["fg", "bg"],
  ["fg", "surface"],
  ["fg", "surface2"],
  ["fg", "surfaceHover"],
  ["muted", "bg"],
  ["muted", "surface"],
  ["muted", "surface2"],
  ["onAccent", "accent"],
  ["onAccent", "accentHover"],
  ["onAccentSoft", "accentSoft"],
  ["accent", "surface"],
  ["accent", "surface2"],
  ["warning", "surface"],
  ["warning", "warningSoft"],
];

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}
export function luminance(hex: string): number {
  const n = parseInt(hex.replace("#", ""), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** CSS custom properties for a config: colour tokens + font-size scale. Applied on the shop root. */
export function shopCssVars(config: UIConfig): CSSProperties {
  const t = THEME_TOKENS[config.theme];
  const base = FONT_SIZE_PX[config.fontSize];
  const vars: Record<string, string> = {
    "--c-bg": t.bg,
    "--c-surface": t.surface,
    "--c-surface-2": t.surface2,
    "--c-surface-hover": t.surfaceHover,
    "--c-border": t.border,
    "--c-fg": t.fg,
    "--c-muted": t.muted,
    "--c-accent": t.accent,
    "--c-accent-hover": t.accentHover,
    "--c-on-accent": t.onAccent,
    "--c-accent-soft": t.accentSoft,
    "--c-on-accent-soft": t.onAccentSoft,
    "--c-warning": t.warning,
    "--c-warning-soft": t.warningSoft,
    "--c-star": t.star,
    "--c-star-empty": t.starEmpty,
    "--c-focus": t.focus,
    "--c-overlay": t.overlay,
    "--shadow-card": t.shadow,
    "--fs-base": `${base}px`,
    // Spacing grows at half the rate of the font so large text gets proportionally more room.
    "--spacing": `${(4 * (0.5 + (0.5 * base) / 16)).toFixed(3)}px`,
  };
  for (const [k, v] of Object.entries(TYPE_SCALE)) vars[`--fs-${k}`] = `${(base * v).toFixed(2)}px`;
  return vars as CSSProperties;
}
