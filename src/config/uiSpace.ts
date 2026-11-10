import { z } from "zod";

/**
 * Single source of truth for the interface configuration space.
 * Seven settings, each grounded in an HCI principle: 3 x 2 x 3 x 2 x 2 x 3 x 2 = 432 configurations.
 * The first level of every setting is the base level; the base configuration is every first level.
 */

export const SETTING_KEYS = ["textSize", "targetSize", "buttonStyle", "iconLabels", "contrast", "layout", "guidance"] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];

export const SETTING_LEVELS = {
  textSize: ["standard", "large", "xlarge"],
  targetSize: ["standard", "large"],
  buttonStyle: ["flat", "outlined", "raised"],
  iconLabels: ["iconOnly", "iconText"],
  contrast: ["standard", "high"],
  layout: ["grid3", "grid2", "list"],
  guidance: ["none", "hints"],
} as const satisfies Record<SettingKey, readonly [string, ...string[]]>;

/** What each setting stands for, for the README, codebook and paper. */
export const SETTING_INFO: Record<SettingKey, { name: string; principle: string; levels: Record<string, string> }> = {
  textSize: {
    name: "Text size",
    principle: "Legibility / readability",
    levels: { standard: "Body text 17 px (Latin) / 19 px (Urdu)", large: "20 px / 23 px", xlarge: "24 px / 27 px" },
  },
  targetSize: {
    name: "Target size",
    principle: "Fitts's law / motor ease",
    levels: { standard: "Interactive elements at least 36 px tall", large: "At least 52 px tall, with more space between them" },
  },
  buttonStyle: {
    name: "Button style",
    principle: "Affordance / signifiers (Norman)",
    levels: { flat: "Text-style actions in colour, no border or fill", outlined: "Visible border and padding", raised: "Filled, subtle shadow, pressed state" },
  },
  iconLabels: {
    name: "Icon labels",
    principle: "Learnability: recognition over recall",
    levels: { iconOnly: "Icons only (accessible names, no visible text)", iconText: "Icons with a short visible text label" },
  },
  contrast: {
    name: "Contrast",
    principle: "Perceptibility / accessibility",
    levels: { standard: "WCAG AA (at least 4.5:1 for body text)", high: "WCAG AAA (at least 7:1), stronger borders and focus outlines" },
  },
  layout: {
    name: "Layout",
    principle: "Information density / cognitive load",
    levels: { grid3: "Cards in 3 columns", grid2: "Cards in 2 columns", list: "One product per row, large image, quantity control in the row" },
  },
  guidance: {
    name: "Guidance",
    principle: "Learnability: help in context",
    levels: { none: "No hints", hints: "Short inline hints above the products, next to the basket and near the search box" },
  },
};

const enumOf = <K extends SettingKey>(k: K) => z.enum(SETTING_LEVELS[k]);

export const UIConfigSchema = z.object({
  textSize: enumOf("textSize"),
  targetSize: enumOf("targetSize"),
  buttonStyle: enumOf("buttonStyle"),
  iconLabels: enumOf("iconLabels"),
  contrast: enumOf("contrast"),
  layout: enumOf("layout"),
  guidance: enumOf("guidance"),
});
export type UIConfig = z.infer<typeof UIConfigSchema>;

/** Base configuration: every clip starts here and every Session B task starts here. */
export const DEFAULT_CONFIG: UIConfig = Object.fromEntries(SETTING_KEYS.map((k) => [k, SETTING_LEVELS[k][0]])) as UIConfig;

export function toConfigId(config: UIConfig): string {
  const c = UIConfigSchema.parse(config);
  return SETTING_KEYS.map((k) => c[k]).join("-");
}

export function fromConfigId(id: string): UIConfig {
  const parts = id.split("-");
  if (parts.length !== SETTING_KEYS.length) throw new Error(`Invalid config ID "${id}": expected ${SETTING_KEYS.length} parts`);
  const raw = Object.fromEntries(SETTING_KEYS.map((k, i) => [k, parts[i]]));
  const parsed = UIConfigSchema.safeParse(raw);
  if (!parsed.success) throw new Error(`Invalid config ID "${id}": ${z.prettifyError(parsed.error)}`);
  return parsed.data;
}

export function isConfigId(id: string): boolean {
  try {
    fromConfigId(id);
    return true;
  } catch {
    return false;
  }
}

/** Zod schema for a config ID string (validated against the space). */
export const ConfigIdSchema = z.string().refine(isConfigId, { message: "Not a valid UI config ID" });

export const DEFAULT_CONFIG_ID = toConfigId(DEFAULT_CONFIG);

/** All 432 configurations in a stable order (first setting varies slowest). */
export function allConfigs(): UIConfig[] {
  let out: Record<string, string>[] = [{}];
  for (const k of SETTING_KEYS) out = out.flatMap((partial) => SETTING_LEVELS[k].map((level) => ({ ...partial, [k]: level })));
  return out as UIConfig[];
}

export const ALL_CONFIG_IDS: readonly string[] = allConfigs().map(toConfigId);

/** Number of settings in which `config` differs from `base` (0-7). Used to balance transition "busyness" across clips. */
export function numChangedSettings(config: UIConfig, base: UIConfig = DEFAULT_CONFIG): number {
  return SETTING_KEYS.reduce((n, k) => n + (config[k] === base[k] ? 0 : 1), 0);
}
