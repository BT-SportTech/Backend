-- CreateEnum
CREATE TYPE "MatchOutcome" AS ENUM ('WIN', 'LOSS', 'DRAW');

-- AlterTable
ALTER TABLE "EventRegistration" ADD COLUMN "outcome" "MatchOutcome",
ADD COLUMN "pointsEarned" INTEGER NOT NULL DEFAULT 0;
