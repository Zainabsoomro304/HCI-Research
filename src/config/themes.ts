import type { CSSProperties } from "react";
import { LINE_HEIGHT, TARGET_PX, TEXT_SIZE_PX, TYPE_SCALE, type Lang } from "./shop";
import type { UIConfig } from "./uiSpace";

/**
 * Colour tokens for the two contrast levels. "standard" meets WCAG AA (4.5:1 for text), "high" meets WCAG AAA (7:1)
 * with stronger borders and focus outlines. Every text/background pair is checked in tests/unit/themes.test.ts.
 * Both are light, calm and deliberate: standard is the soft modern look, not a degraded one.
 */
export interface ThemeTokens {
  bg: string;
  surface: string;
  surface2: string;
  surfaceHover: string;
  border: string;
  /** Border of outlined buttons and inputs. */
  control: string;
  fg: string;
  muted: string;
  accent: string;
  accentHover: string;
  accentPressed: string;
  onAccent: string;
  accentSoft: string;
  onAccentSoft: string;
  warning: string;
  warningSoft: string;
  hint: string;
  onHint: string;
  star: string;
  starEmpty: string;
  focus: string;
  focusWidth: string;
  borderWidth: string;
  overlay: string;
  shadow: string;
  raisedShadow: string;
}

export const CONTRAST_TOKENS: Record<UIConfig["contrast"], ThemeTokens> = {
  standard: {
    bg: "#F6F5F1",
    surface: "#FFFFFF",
    surface2: "#FFFFFF",
    surfaceHover: "#F1F0EB",
    border: "#E3E1DA",
    control: "#C9C6BD",
    fg: "#2B2F33",
    muted: "#62676C",
    accent: "#1E7552",
    accentHover: "#18664A",
    accentPressed: "#13553D",
    onAccent: "#FFFFFF",
    accentSoft: "#E3F1EA",
    onAccentSoft: "#185C42",
    warning: "#AE3B24",
    warningSoft: "#FBEAE5",
    hint: "#EEF5FB",
    onHint: "#2C5274",
    star: "#B47A0B",
    starEmpty: "#DAD7CF",
    focus: "#2F6FDB",
    focusWidth: "2px",
    borderWidth: "1px",
    overlay: "rgba(28, 30, 33, 0.42)",
    shadow: "0 1px 2px rgba(40, 38, 30, 0.06), 0 2px 8px rgba(40, 38, 30, 0.05)",
    raisedShadow: "0 1px 1px rgba(20, 50, 35, 0.18), 0 2px 5px rgba(20, 50, 35, 0.18)",
  },
  high: {
    bg: "#FFFFFF",
    surface: "#FFFFFF",
    surface2: "#FFFFFF",
    surfaceHover: "#ECECEC",
    border: "#5F5F5F",
    control: "#1A1A1A",
    fg: "#000000",
    muted: "#2E2E2E",
    accent: "#0B4D33",
    accentHover: "#083D28",
    accentPressed: "#062E1E",
    onAccent: "#FFFFFF",
    accentSoft: "#D6EBDF",
    onAccentSoft: "#062E1E",
    warning: "#7F1D0E",
    warningSoft: "#FBE3DD",
    hint: "#E3EEF8",
    onHint: "#0E2A44",
    star: "#6E4A00",
    starEmpty: "#8A8A8A",
    focus: "#0039A6",
    focusWidth: "3px",
    borderWidth: "2px",
    overlay: "rgba(0, 0, 0, 0.6)",
    shadow: "none",
    raisedShadow: "0 1px 1px rgba(0, 0, 0, 0.35), 0 2px 5px rgba(0, 0, 0, 0.3)",
  },
};

/** Pairs [foreground, background] that carry text. AA levels need 4.5:1, AAA levels 7:1. */
export const TEXT_PAIRS: [keyof ThemeTokens, keyof ThemeTokens][] = [
  ["fg", "bg"],
  ["fg", "surface"],
  ["fg", "surfaceHover"],
  ["muted", "bg"],
  ["muted", "surface"],
  ["onAccent", "accent"],
  ["onAccent", "accentHover"],
  ["onAccent", "accentPressed"],
  ["onAccentSoft", "accentSoft"],
  ["accent", "surface"],
  ["accent", "bg"],
  ["accent", "surfaceHover"],
  ["warning", "surface"],
  ["warning", "warningSoft"],
  ["onHint", "hint"],
];
export const REQUIRED_RATIO: Record<UIConfig["contrast"], number> = { standard: 4.5, high: 7 };

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

/** CSS custom properties for a config in a language: colours, type scale, line height and target size. */
export function shopCssVars(config: UIConfig, lang: Lang): CSSProperties {
  const t = CONTRAST_TOKENS[config.contrast];
  const base = TEXT_SIZE_PX[lang][config.textSize];
  const target = TARGET_PX[config.targetSize];
  const vars: Record<string, string> = {
    "--c-bg": t.bg,
    "--c-surface": t.surface,
    "--c-surface-2": t.surface2,
    "--c-surface-hover": t.surfaceHover,
    "--c-border": t.border,
    "--c-control": t.control,
    "--c-fg": t.fg,
    "--c-muted": t.muted,
    "--c-accent": t.accent,
    "--c-accent-hover": t.accentHover,
    "--c-accent-pressed": t.accentPressed,
    "--c-on-accent": t.onAccent,
    "--c-accent-soft": t.accentSoft,
    "--c-on-accent-soft": t.onAccentSoft,
    "--c-warning": t.warning,
    "--c-warning-soft": t.warningSoft,
    "--c-hint": t.hint,
    "--c-on-hint": t.onHint,
    "--c-star": t.star,
    "--c-star-empty": t.starEmpty,
    "--c-focus": t.focus,
    "--focus-width": t.focusWidth,
    "--bw": t.borderWidth,
    "--c-overlay": t.overlay,
    "--shadow-card": t.shadow,
    "--shadow-raised": t.raisedShadow,
    "--fs-base": `${base}px`,
    "--lh": String(LINE_HEIGHT[lang]),
    "--tap": `${target.min}px`,
    "--tap-gap": `${target.gap}px`,
    // Spacing grows at half the rate of the text, so large text gets proportionally more room.
    "--spacing": `${(4 * (0.5 + (0.5 * base) / TEXT_SIZE_PX[lang].standard)).toFixed(3)}px`,
  };
  for (const [k, v] of Object.entries(TYPE_SCALE)) vars[`--fs-${k}`] = `${(base * v).toFixed(2)}px`;
  return vars as CSSProperties;
}
