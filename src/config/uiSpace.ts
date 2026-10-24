import { z } from "zod";

/**
 * Single source of truth for the interface configuration space.
 * 3 layouts x 3 font sizes x 3 densities x 2 themes x 2 menus = 108 configurations.
 */

export const LAYOUTS = ["list", "grid2", "grid3"] as const;
export const FONT_SIZES = ["small", "default", "large"] as const;
export const DENSITIES = ["detailed", "partial", "summary"] as const;
export const THEMES = ["light", "dark"] as const;
export const MENUS = ["sidebar", "dropdown"] as const;

/** Order of the settings in the canonical ID: layout-fontSize-density-theme-menu. */
export const SETTING_KEYS = ["layout", "fontSize", "density", "theme", "menu"] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];

export const SETTING_LEVELS = {
  layout: LAYOUTS,
  fontSize: FONT_SIZES,
  density: DENSITIES,
  theme: THEMES,
  menu: MENUS,
} as const satisfies Record<SettingKey, readonly string[]>;

export const UIConfigSchema = z.object({
  layout: z.enum(LAYOUTS),
  fontSize: z.enum(FONT_SIZES),
  density: z.enum(DENSITIES),
  theme: z.enum(THEMES),
  menu: z.enum(MENUS),
});
export type UIConfig = z.infer<typeof UIConfigSchema>;

/** Base configuration: every clip starts here and every Session B task starts here. Change it only here. */
export const DEFAULT_CONFIG: UIConfig = {
  layout: "list",
  fontSize: "default",
  density: "detailed",
  theme: "light",
  menu: "sidebar",
};

export function toConfigId(config: UIConfig): string {
  const c = UIConfigSchema.parse(config);
  return SETTING_KEYS.map((k) => c[k]).join("-");
}

export function fromConfigId(id: string): UIConfig {
  const parts = id.split("-");
  if (parts.length !== SETTING_KEYS.length) throw new Error(`Invalid config ID "${id}": expected 5 parts`);
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

/** All 108 configurations in a stable order (layout varies slowest). */
export function allConfigs(): UIConfig[] {
  const out: UIConfig[] = [];
  for (const layout of LAYOUTS)
    for (const fontSize of FONT_SIZES)
      for (const density of DENSITIES)
        for (const theme of THEMES)
          for (const menu of MENUS) out.push({ layout, fontSize, density, theme, menu });
  return out;
}

export const ALL_CONFIG_IDS: readonly string[] = allConfigs().map(toConfigId);
