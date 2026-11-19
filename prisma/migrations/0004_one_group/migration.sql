-- One group, two sessions. Replaces the phase concept with a single participant type and the session types
-- "comparison" (Session 1) and "shopping" (Session 2). Adds the questionnaire score column.
--
-- Changes structure and identifiers only. It never edits a recorded answer, choice, timing, flag or timestamp.
-- scripts/preservation.ts checks this field by field (pnpm preserve compare <snapshot>).

-- 1. Participants: one code format. The old code is kept in "legacyCode".
ALTER TABLE "Participant" ADD COLUMN "legacyCode" TEXT;
ALTER TABLE "Participant" ADD COLUMN "protocol" TEXT NOT NULL DEFAULT 'current';
UPDATE "Participant" SET "legacyCode" = "code";

DROP INDEX "Participant_studyPhase_number_key";

-- Real participants become P-001, P-002, ... and simulated ones P-S001, ..., numbered in their old order
-- (old phase, then old number), so existing real participants keep their order.
WITH numbered AS (
  SELECT "id", "isSimulated",
         row_number() OVER (PARTITION BY "isSimulated" ORDER BY "studyPhase", "number", "createdAt", "id") AS n
  FROM "Participant"
)
UPDATE "Participant" AS p
SET "number" = numbered.n,
    "code" = CASE WHEN numbered."isSimulated" THEN 'P-S' ELSE 'P-' END || lpad(numbered.n::text, 3, '0')
FROM numbered
WHERE p."id" = numbered."id";

ALTER TABLE "Participant" DROP COLUMN "studyPhase";
CREATE UNIQUE INDEX "Participant_isSimulated_number_key" ON "Participant"("isSimulated", "number");

-- 2. Sessions: comparison (was phase1 / p3_sessionA) and shopping (was p3_sessionB).
CREATE TYPE "SessionType_new" AS ENUM ('comparison', 'shopping');
ALTER TABLE "Session"
  ALTER COLUMN "type" TYPE "SessionType_new"
  USING (CASE "type"::text WHEN 'p3_sessionB' THEN 'shopping' ELSE 'comparison' END)::"SessionType_new";
DROP TYPE "SessionType";
ALTER TYPE "SessionType_new" RENAME TO "SessionType";

-- Shopping sessions paused on the old questionnaire steps (test databases only) continue at the new ones.
UPDATE "Session" SET "currentStep" = 'seq' WHERE "type" = 'shopping' AND "currentStep" = 'quis';
UPDATE "Session" SET "currentStep" = 'sus' WHERE "type" = 'shopping' AND "currentStep" = 'ues_sf';

-- Everyone gets a shopping session (Session 2). New, unused rows with a fresh link token; nothing existing changes.
INSERT INTO "Session" ("id", "participantId", "type", "token", "status", "currentStep", "currentIndex", "createdAt", "updatedAt")
SELECT 'mig' || substr(md5(random()::text || clock_timestamp()::text || p."id"), 1, 22),
       p."id",
       'shopping',
       substr(md5(random()::text || clock_timestamp()::text || p."id" || 'token'), 1, 24),
       'not_started',
       'consent',
       0,
       CURRENT_TIMESTAMP,
       CURRENT_TIMESTAMP
FROM "Participant" AS p
WHERE NOT EXISTS (SELECT 1 FROM "Session" AS s WHERE s."participantId" = p."id" AND s."type" = 'shopping');

-- 3. Questionnaires: computed scale score (SUS 0-100, SEQ 1-7). Empty for answers given before this version.
ALTER TABLE "QuestionnaireResponse" ADD COLUMN "score" DOUBLE PRECISION;

-- Freeze report: the cluster choice and its stability.
ALTER TABLE "FrozenModel" ADD COLUMN "clusters" JSONB;
