-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ParticipantGroup" AS ENUM ('cs', 'nonCs', 'unknown');

-- CreateEnum
CREATE TYPE "SessionType" AS ENUM ('phase1', 'p3_sessionA', 'p3_sessionB');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('not_started', 'in_progress', 'completed');

-- CreateTable
CREATE TABLE "Participant" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "studyPhase" INTEGER NOT NULL,
    "number" INTEGER NOT NULL,
    "group" "ParticipantGroup" NOT NULL DEFAULT 'unknown',
    "groupSource" TEXT,
    "language" TEXT NOT NULL DEFAULT 'en',
    "seed" INTEGER NOT NULL,
    "notes" TEXT,
    "conditionRowOverride" INTEGER,
    "taskRowOverride" INTEGER,
    "completionCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Participant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "type" "SessionType" NOT NULL,
    "token" TEXT NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'not_started',
    "currentStep" TEXT NOT NULL DEFAULT 'consent',
    "currentIndex" INTEGER NOT NULL DEFAULT 0,
    "appVersion" TEXT,
    "userAgent" TEXT,
    "viewportW" INTEGER,
    "viewportH" INTEGER,
    "conditionRow" INTEGER,
    "taskRow" INTEGER,
    "unlockedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsentRecord" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "consentTextHash" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "consentedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clientTs" TIMESTAMP(3),

    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuestionnaireResponse" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "instrument" TEXT NOT NULL,
    "instrumentVersion" TEXT,
    "taskBlockId" TEXT,
    "responses" JSONB NOT NULL,
    "clientTs" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuestionnaireResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComparisonTrial" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "trialIndex" INTEGER NOT NULL,
    "isPractice" BOOLEAN NOT NULL DEFAULT false,
    "isRepeat" BOOLEAN NOT NULL DEFAULT false,
    "repeatOfTrialId" TEXT,
    "isAttentionCheck" BOOLEAN NOT NULL DEFAULT false,
    "leftClipId" TEXT NOT NULL,
    "rightClipId" TEXT NOT NULL,
    "leftNumChangedSettings" INTEGER NOT NULL,
    "rightNumChangedSettings" INTEGER NOT NULL,
    "choice" TEXT,
    "chosenClipId" TEXT,
    "rtMs" INTEGER,
    "replayCount" INTEGER,
    "clientShownAt" TIMESTAMP(3),
    "clientBothEndedAt" TIMESTAMP(3),
    "clientRespondedAt" TIMESTAMP(3),
    "serverRespondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComparisonTrial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BreakRecord" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "afterTrialIndex" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "durationMs" INTEGER,

    CONSTRAINT "BreakRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskBlock" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "blockIndex" INTEGER NOT NULL,
    "isPractice" BOOLEAN NOT NULL DEFAULT false,
    "condition" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "planSnapshot" JSONB NOT NULL,
    "appliedConfigs" JSONB,
    "finalConfigId" TEXT,
    "cart" JSONB,
    "startedAt" TIMESTAMP(3),
    "firstInteractionAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "requiredItemsFound" INTEGER,
    "withinBudget" BOOLEAN,
    "totalSpent" INTEGER,
    "durationMs" INTEGER,
    "extraItems" INTEGER,

    CONSTRAINT "TaskBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdaptationPlan" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "condition" TEXT NOT NULL,
    "steps" JSONB NOT NULL,
    "sourceFileName" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdaptationPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ranking" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "blockIndex" INTEGER NOT NULL,
    "condition" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "finalConfigId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "reason" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ranking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" BIGSERIAL NOT NULL,
    "clientEventId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "trialId" TEXT,
    "configId" TEXT,
    "type" TEXT NOT NULL,
    "clientTs" TIMESTAMP(3) NOT NULL,
    "clientTsMs" BIGINT NOT NULL,
    "serverTs" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSONB,
    "isPractice" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Participant_code_key" ON "Participant"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Participant_studyPhase_number_key" ON "Participant"("studyPhase", "number");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_participantId_idx" ON "Session"("participantId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_participantId_type_key" ON "Session"("participantId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "ConsentRecord_sessionId_key" ON "ConsentRecord"("sessionId");

-- CreateIndex
CREATE INDEX "ConsentRecord_participantId_idx" ON "ConsentRecord"("participantId");

-- CreateIndex
CREATE INDEX "QuestionnaireResponse_participantId_idx" ON "QuestionnaireResponse"("participantId");

-- CreateIndex
CREATE INDEX "QuestionnaireResponse_sessionId_idx" ON "QuestionnaireResponse"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "QuestionnaireResponse_sessionId_instrument_taskBlockId_key" ON "QuestionnaireResponse"("sessionId", "instrument", "taskBlockId");

-- CreateIndex
CREATE INDEX "ComparisonTrial_participantId_idx" ON "ComparisonTrial"("participantId");

-- CreateIndex
CREATE INDEX "ComparisonTrial_sessionId_idx" ON "ComparisonTrial"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "ComparisonTrial_sessionId_seq_key" ON "ComparisonTrial"("sessionId", "seq");

-- CreateIndex
CREATE INDEX "BreakRecord_participantId_idx" ON "BreakRecord"("participantId");

-- CreateIndex
CREATE UNIQUE INDEX "BreakRecord_sessionId_afterTrialIndex_key" ON "BreakRecord"("sessionId", "afterTrialIndex");

-- CreateIndex
CREATE INDEX "TaskBlock_participantId_idx" ON "TaskBlock"("participantId");

-- CreateIndex
CREATE INDEX "TaskBlock_sessionId_idx" ON "TaskBlock"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskBlock_sessionId_blockIndex_key" ON "TaskBlock"("sessionId", "blockIndex");

-- CreateIndex
CREATE INDEX "AdaptationPlan_participantId_idx" ON "AdaptationPlan"("participantId");

-- CreateIndex
CREATE UNIQUE INDEX "AdaptationPlan_participantId_condition_key" ON "AdaptationPlan"("participantId", "condition");

-- CreateIndex
CREATE INDEX "Ranking_participantId_idx" ON "Ranking"("participantId");

-- CreateIndex
CREATE UNIQUE INDEX "Ranking_sessionId_blockIndex_key" ON "Ranking"("sessionId", "blockIndex");

-- CreateIndex
CREATE UNIQUE INDEX "Event_clientEventId_key" ON "Event"("clientEventId");

-- CreateIndex
CREATE INDEX "Event_participantId_idx" ON "Event"("participantId");

-- CreateIndex
CREATE INDEX "Event_sessionId_idx" ON "Event"("sessionId");

-- CreateIndex
CREATE INDEX "Event_trialId_idx" ON "Event"("trialId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionnaireResponse" ADD CONSTRAINT "QuestionnaireResponse_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionnaireResponse" ADD CONSTRAINT "QuestionnaireResponse_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuestionnaireResponse" ADD CONSTRAINT "QuestionnaireResponse_taskBlockId_fkey" FOREIGN KEY ("taskBlockId") REFERENCES "TaskBlock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComparisonTrial" ADD CONSTRAINT "ComparisonTrial_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComparisonTrial" ADD CONSTRAINT "ComparisonTrial_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComparisonTrial" ADD CONSTRAINT "ComparisonTrial_repeatOfTrialId_fkey" FOREIGN KEY ("repeatOfTrialId") REFERENCES "ComparisonTrial"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreakRecord" ADD CONSTRAINT "BreakRecord_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BreakRecord" ADD CONSTRAINT "BreakRecord_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskBlock" ADD CONSTRAINT "TaskBlock_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskBlock" ADD CONSTRAINT "TaskBlock_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdaptationPlan" ADD CONSTRAINT "AdaptationPlan_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ranking" ADD CONSTRAINT "Ranking_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ranking" ADD CONSTRAINT "Ranking_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

