import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { EXPECTED_MINUTES } from "@/config/study";

/**
 * Researcher contact details for the information sheet and consent form: content/study-info.json.
 * The researchers fill it in once; nothing about it is hard-coded. STUDY_INFO_FILE points at another file (tests and
 * local rehearsals use a clearly fictional example). Until every required field is filled in, participant links show
 * "the study is not open yet" instead of an incomplete consent form, and the admin panel lists what is missing.
 */
export const StudyInfoSchema = z.object({
  researcherNames: z.string(),
  university: z.string(),
  /** Optional Urdu name of the university; the English name is used if empty. */
  universityUrdu: z.string().default(""),
  courseName: z.string(),
  /** Optional Urdu course name; the English name is used if empty. */
  courseNameUrdu: z.string().default(""),
  supervisorName: z.string(),
  contactEmail: z.string(),
});
export type StudyInfo = z.infer<typeof StudyInfoSchema>;

export const REQUIRED_STUDY_INFO = ["researcherNames", "university", "courseName", "supervisorName", "contactEmail"] as const;

export function studyInfoPath(): string {
  return process.env.STUDY_INFO_FILE ? path.resolve(process.env.STUDY_INFO_FILE) : path.resolve(process.cwd(), "content/study-info.json");
}

export function loadStudyInfo(): StudyInfo {
  const file = studyInfoPath();
  const r = StudyInfoSchema.safeParse(JSON.parse(fs.readFileSync(file, "utf8")));
  if (!r.success) throw new Error(`Invalid ${path.basename(file)}:\n${z.prettifyError(r.error)}`);
  return r.data;
}

/** Required fields that are still empty (or not a plausible e-mail address). Empty list = ready for participants. */
export function missingStudyInfo(info: StudyInfo = loadStudyInfo()): string[] {
  const missing: string[] = REQUIRED_STUDY_INFO.filter((k) => !info[k].trim());
  if (info.contactEmail.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(info.contactEmail.trim())) missing.push("contactEmail (not a valid e-mail address)");
  return missing;
}

/** Values substituted into {{name}} slots of the consent text. */
export function consentValues(lang: string, info: StudyInfo = loadStudyInfo()): Record<string, string> {
  return {
    researcherNames: info.researcherNames.trim(),
    university: (lang === "ur" && info.universityUrdu.trim()) || info.university.trim(),
    courseName: (lang === "ur" && info.courseNameUrdu.trim()) || info.courseName.trim(),
    supervisorName: info.supervisorName.trim(),
    contactEmail: info.contactEmail.trim(),
    minutesComparison: String(EXPECTED_MINUTES.comparison),
    minutesShopping: String(EXPECTED_MINUTES.shopping),
  };
}

/** Replaces every {{name}} slot. An unknown slot is an error, so a typo can never reach a participant. */
export function fillTemplate(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, name: string) => {
    if (!(name in values)) throw new Error(`Unknown slot {{${name}}} in the consent text`);
    return values[name]!;
  });
}
