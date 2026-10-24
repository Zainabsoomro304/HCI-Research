import type { UIConfig } from "./uiSpace";

/** Neutral invented shop name shown in the top bar. */
export const SHOP_NAME = "Everyday Market";

/** Currency symbol and placement. Catalogue prices are plain integers. */
export const CURRENCY_SYMBOL = "$";
export const CURRENCY_POSITION: "prefix" | "suffix" = "prefix";

export function formatPrice(amount: number): string {
  const n = amount.toLocaleString("en-US");
  return CURRENCY_POSITION === "prefix" ? `${CURRENCY_SYMBOL}${n}` : `${n} ${CURRENCY_SYMBOL}`;
}

/** Base body font size in px per fontSize level. Headings scale proportionally from this. */
export const FONT_SIZE_PX: Record<UIConfig["fontSize"], number> = {
  small: 14,
  default: 16,
  large: 19,
};

/** Type scale relative to the base size. */
export const TYPE_SCALE = {
  caption: 0.8125,
  small: 0.875,
  body: 1,
  title: 1.125,
  heading: 1.5,
  brand: 1.25,
} as const;

/** Category display order (same in sidebar and dropdown). */
export const CATEGORIES = [
  "Food & Snacks",
  "Picnic & Outdoor",
  "Home & Office",
  "Gifts",
  "Sports & Fitness",
  "Kitchen",
] as const;
export type Category = (typeof CATEGORIES)[number];

/** Category used in clip mode, and number of products shown there. */
export const CLIP_CATEGORY: Category = "Home & Office";
export const CLIP_PRODUCT_COUNT = 9;
