import type { UIConfig } from "./uiSpace";

export const LANGUAGES = ["en", "ur"] as const;
export type Lang = (typeof LANGUAGES)[number];
export const isLang = (x: unknown): x is Lang => x === "en" || x === "ur";
export const dirOf = (lang: Lang) => (lang === "ur" ? "rtl" : "ltr");

/** Neutral invented store name. */
export const STORE_NAME: Record<Lang, string> = { en: "Ghar Ka Sauda", ur: "گھر کا سودا" };

/**
 * Digits used for numbers in Urdu. Western digits (0-9) are the norm in Pakistani shopping apps; set to false for
 * Eastern Arabic-Indic digits (۰-۹).
 */
export const URDU_WESTERN_DIGITS = true;

const URDU_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

export function formatNumber(n: number, lang: Lang): string {
  const s = n.toLocaleString("en-US");
  return lang === "ur" && !URDU_WESTERN_DIGITS ? s.replace(/\d/g, (d) => URDU_DIGITS[Number(d)]!) : s;
}

/** Prices are integers in PKR: "Rs 1,250" in English and "1,250 روپے" in Urdu. */
export function formatPrice(amount: number, lang: Lang): string {
  const n = formatNumber(amount, lang);
  return lang === "ur" ? `${n} روپے` : `Rs ${n}`;
}

/**
 * Body text size per textSize level. Nastaliq is visually smaller at the same pixel size, so Urdu is scaled separately
 * to match the visual size of the Latin text.
 */
export const TEXT_SIZE_PX: Record<Lang, Record<UIConfig["textSize"], number>> = {
  en: { standard: 17, large: 20, xlarge: 24 },
  ur: { standard: 19, large: 23, xlarge: 27 },
};

/** Nastaliq has tall ascenders and deep descenders: it needs a much taller line than Latin text. */
export const LINE_HEIGHT: Record<Lang, number> = { en: 1.45, ur: 2.05 };

/** Minimum height of every interactive element, and the space between neighbouring targets. */
export const TARGET_PX: Record<UIConfig["targetSize"], { min: number; gap: number }> = {
  standard: { min: 36, gap: 8 },
  large: { min: 52, gap: 14 },
};

/** Type scale relative to the body size. Headings scale proportionally. */
export const TYPE_SCALE = {
  caption: 0.82,
  small: 0.9,
  body: 1,
  title: 1.12,
  heading: 1.42,
  brand: 1.2,
} as const;

/** Category order (also the order of the category buttons). Names live in content/strings.<lang>.json as cat.<id>. */
export const CATEGORIES = ["fruitsVeg", "grains", "dairy", "spices", "tea", "oil", "bakery", "cleaning"] as const;
export type Category = (typeof CATEGORIES)[number];

/** Comparison clips show one of these categories ("scenes"). Configurable; balanced across each participant's trials. */
export const CLIP_SCENES = ["fruitsVeg", "grains", "dairy", "spices", "tea", "cleaning"] as const satisfies readonly Category[];
export type Scene = (typeof CLIP_SCENES)[number];
export const isScene = (x: unknown): x is Scene => (CLIP_SCENES as readonly string[]).includes(x as string);

/** Each scene shows the first N products of its category in catalogue order (chosen to fill the frame equally). */
export const SCENE_PRODUCT_COUNT = 9;

/** Stills (ranking screen, admin thumbnails) all use this scene. */
export const STILL_SCENE: Scene = "grains";
