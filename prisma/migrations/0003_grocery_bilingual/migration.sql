-- AlterTable
ALTER TABLE "ComparisonTrial" ADD COLUMN     "language" TEXT NOT NULL DEFAULT 'en',
ADD COLUMN     "scene" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "language" TEXT,
ALTER COLUMN "currentStep" SET DEFAULT 'language';

-- CreateTable
CREATE TABLE "TranslationReview" (
    "key" TEXT NOT NULL,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "TranslationReview_pkey" PRIMARY KEY ("key")
);

