import { z } from "zod";

/** Background questionnaire (Phase 1 and Phase 3 Session A). Stored as structured JSON. */
export const GENDERS = ["woman", "man", "nonBinary", "selfDescribe", "preferNot"] as const;
export const OCCUPATIONS = ["student", "employed", "selfEmployed", "notWorking", "retired", "other"] as const;
export const SHOPPING_FREQUENCIES = ["never", "lessThanMonthly", "monthly", "weekly", "severalPerWeek"] as const;
export const PREF_LAYOUT = ["list", "grid2", "grid3", "noPreference"] as const;
export const PREF_TEXT_SIZE = ["small", "medium", "large", "noPreference"] as const;
export const PREF_DETAIL = ["lots", "some", "minimal", "noPreference"] as const;
export const PREF_THEME = ["light", "dark", "noPreference"] as const;
export const PREF_MENU = ["side", "dropdown", "noPreference"] as const;

export const BackgroundSchema = z
  .object({
    age: z.number().int().min(18).max(99),
    gender: z.enum(GENDERS),
    genderSelfDescribe: z.string().trim().max(100).optional(),
    occupation: z.enum(OCCUPATIONS),
    occupationOther: z.string().trim().max(100).optional(),
    field: z.string().trim().max(200),
    csOrIt: z.enum(["yes", "no"]),
    techConfidence: z.number().int().min(1).max(7),
    shoppingFrequency: z.enum(SHOPPING_FREQUENCIES),
    prefLayout: z.enum(PREF_LAYOUT),
    prefTextSize: z.enum(PREF_TEXT_SIZE),
    prefDetail: z.enum(PREF_DETAIL),
    prefTheme: z.enum(PREF_THEME),
    prefMenu: z.enum(PREF_MENU),
  })
  .superRefine((v, ctx) => {
    if (v.gender === "selfDescribe" && !v.genderSelfDescribe)
      ctx.addIssue({ code: "custom", path: ["genderSelfDescribe"], message: "required" });
  });
export type BackgroundAnswers = z.infer<typeof BackgroundSchema>;

/** Column order for questionnaire_background.csv. */
export const BACKGROUND_ITEMS: (keyof BackgroundAnswers)[] = [
  "age",
  "gender",
  "genderSelfDescribe",
  "occupation",
  "occupationOther",
  "field",
  "csOrIt",
  "techConfidence",
  "shoppingFrequency",
  "prefLayout",
  "prefTextSize",
  "prefDetail",
  "prefTheme",
  "prefMenu",
];
