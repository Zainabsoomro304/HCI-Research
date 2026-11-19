import { z } from "zod";
import { SETTING_KEYS, SETTING_LEVELS, type SettingKey } from "@/config/uiSpace";

/**
 * Background questionnaire (Session 1), stored as structured JSON. The CS/IT item is recorded but not used for any
 * subgroup analysis. One self-rated preference item per interface setting, each with "noPreference".
 */
export const GENDERS = ["woman", "man", "preferNot"] as const;
export const OCCUPATIONS = ["employed", "selfEmployed", "homemaker", "retired", "notWorking", "other"] as const;
export const USE_FREQUENCIES = ["never", "monthly", "weekly", "daily"] as const;
export const SHOPPING_FREQUENCIES = ["never", "lessThanMonthly", "monthly", "weekly"] as const;
export const YES_NO = ["yes", "no"] as const;
export const YES_NO_SOMETIMES = ["yes", "no", "sometimes"] as const;
export const READING_LANGUAGES = ["urdu", "english", "both", "other"] as const;
export const NO_PREFERENCE = "noPreference";

/** Questionnaire item name for each setting's self-rated preference. */
export const PREF_ITEMS: Record<SettingKey, `pref${string}`> = {
  textSize: "prefTextSize",
  targetSize: "prefTargetSize",
  buttonStyle: "prefButtonStyle",
  iconLabels: "prefIconLabels",
  contrast: "prefContrast",
  layout: "prefLayout",
  guidance: "prefGuidance",
};

const prefEnum = (k: SettingKey) => z.enum([...SETTING_LEVELS[k], NO_PREFERENCE] as [string, ...string[]]);

export const BackgroundSchema = z.object({
  age: z.number().int().min(18).max(110),
  gender: z.enum(GENDERS),
  occupation: z.enum(OCCUPATIONS),
  occupationOther: z.string().trim().max(100).optional(),
  csOrIt: z.enum(YES_NO),
  techConfidence: z.number().int().min(1).max(7),
  smartphoneUse: z.enum(USE_FREQUENCIES),
  computerUse: z.enum(USE_FREQUENCIES),
  shoppingFrequency: z.enum(SHOPPING_FREQUENCIES),
  groceriesOnline: z.enum(YES_NO),
  readingGlasses: z.enum(YES_NO_SOMETIMES),
  readingLanguage: z.enum(READING_LANGUAGES),
  prefTextSize: prefEnum("textSize"),
  prefTargetSize: prefEnum("targetSize"),
  prefButtonStyle: prefEnum("buttonStyle"),
  prefIconLabels: prefEnum("iconLabels"),
  prefContrast: prefEnum("contrast"),
  prefLayout: prefEnum("layout"),
  prefGuidance: prefEnum("guidance"),
});
export type BackgroundAnswers = z.infer<typeof BackgroundSchema>;

/** Column order for questionnaire_background.csv. */
export const BACKGROUND_ITEMS: (keyof BackgroundAnswers)[] = [
  "age",
  "gender",
  "occupation",
  "occupationOther",
  "csOrIt",
  "techConfidence",
  "smartphoneUse",
  "computerUse",
  "shoppingFrequency",
  "groceriesOnline",
  "readingGlasses",
  "readingLanguage",
  ...SETTING_KEYS.map((k) => PREF_ITEMS[k] as keyof BackgroundAnswers),
];
