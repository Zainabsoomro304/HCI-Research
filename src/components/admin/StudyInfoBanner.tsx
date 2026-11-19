import { missingStudyInfo, studyInfoPath } from "@/lib/studyInfo";
import path from "node:path";

/**
 * Server component: until content/study-info.json is filled in, participant links show "the study is not open yet".
 * This banner says which fields are missing.
 */
export function StudyInfoBanner() {
  let missing: string[];
  try {
    missing = missingStudyInfo();
  } catch (e) {
    missing = [`the file could not be read (${(e as Error).message})`];
  }
  if (missing.length === 0) return null;
  return (
    <div className="rounded-md border border-[#f0d9a8] bg-[#fdf3dc] px-4 py-3 text-sm text-[#7a5a10]" data-testid="study-info-missing">
      <p className="font-semibold">Participants cannot start yet: the consent form needs your contact details.</p>
      <p className="mt-1">
        Fill in <code>{path.relative(process.cwd(), studyInfoPath()) || studyInfoPath()}</code> and redeploy. Missing: {missing.join(", ")}.
      </p>
    </div>
  );
}
