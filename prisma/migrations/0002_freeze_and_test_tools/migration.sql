-- AlterTable
ALTER TABLE "AdaptationPlan" ADD COLUMN     "frozenModelId" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'uploaded';

-- AlterTable
ALTER TABLE "Participant" ADD COLUMN     "isSimulated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "simulatedTruth" JSONB,
ADD COLUMN     "withdrawnAt" TIMESTAMP(3),
ADD COLUMN     "withdrawnReason" TEXT;

-- CreateTable
CREATE TABLE "FrozenModel" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "appVersion" TEXT,
    "inputHash" TEXT NOT NULL,
    "settings" JSONB NOT NULL,
    "pool" JSONB NOT NULL,
    "results" JSONB NOT NULL,
    "eligible" JSONB NOT NULL,
    "excluded" JSONB NOT NULL,
    "warnings" JSONB NOT NULL,
    "simulatedCount" INTEGER NOT NULL DEFAULT 0,
    "compromised" BOOLEAN NOT NULL DEFAULT false,
    "computeMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FrozenModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FreezeJob" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "inputHash" TEXT NOT NULL,
    "remaining" JSONB NOT NULL,
    "pool" JSONB,
    "results" JSONB NOT NULL,
    "error" TEXT,
    "computeMs" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FreezeJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminAction" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "action" TEXT NOT NULL,
    "reason" TEXT,
    "details" JSONB,

    CONSTRAINT "AdminAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FrozenModel_version_key" ON "FrozenModel"("version");

-- CreateIndex
CREATE INDEX "AdminAction_at_idx" ON "AdminAction"("at");

