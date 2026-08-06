-- CreateEnum
CREATE TYPE "MatchmakingStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ChessRoundStatus" AS ENUM ('PENDING', 'ACTIVE', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ChessBatchStatus" AS ENUM ('ACTIVE', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ChessMatchResult" AS ENUM ('WHITE_WIN', 'BLACK_WIN', 'DRAW');

-- CreateEnum
CREATE TYPE "ChessMatchStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "boardCount" INTEGER,
ADD COLUMN     "gamesPerPlayer" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "matchmakingStartedAt" TIMESTAMP(3),
ADD COLUMN     "matchmakingStatus" "MatchmakingStatus" NOT NULL DEFAULT 'NOT_STARTED';

-- AlterTable
ALTER TABLE "EventRegistration" ADD COLUMN     "blackGames" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "eventDraws" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "eventLosses" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "eventWins" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "gamesCompleted" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "whiteGames" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "withdrawnAt" TIMESTAMP(3),
ADD COLUMN     "withdrawnById" TEXT;

-- CreateTable
CREATE TABLE "PlayerGameRating" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL DEFAULT 1000,
    "gamesPlayed" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "draws" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PlayerGameRating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChessRound" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "eventId" TEXT NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "status" "ChessRoundStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "ChessRound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChessRoundBatch" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "roundId" TEXT NOT NULL,
    "batchNumber" INTEGER NOT NULL,
    "status" "ChessBatchStatus" NOT NULL DEFAULT 'ACTIVE',
    "boardCount" INTEGER NOT NULL,

    CONSTRAINT "ChessRoundBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChessMatch" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "batchId" TEXT NOT NULL,
    "boardNumber" INTEGER NOT NULL,
    "whiteRegistrationId" TEXT NOT NULL,
    "blackRegistrationId" TEXT NOT NULL,
    "result" "ChessMatchResult",
    "status" "ChessMatchStatus" NOT NULL DEFAULT 'SCHEDULED',
    "completedAt" TIMESTAMP(3),
    "completedById" TEXT,

    CONSTRAINT "ChessMatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlayerGameRating_gameId_rating_idx" ON "PlayerGameRating"("gameId", "rating");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerGameRating_userId_gameId_key" ON "PlayerGameRating"("userId", "gameId");

-- CreateIndex
CREATE UNIQUE INDEX "ChessRound_eventId_roundNumber_key" ON "ChessRound"("eventId", "roundNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ChessRoundBatch_roundId_batchNumber_key" ON "ChessRoundBatch"("roundId", "batchNumber");

-- CreateIndex
CREATE INDEX "ChessMatch_whiteRegistrationId_idx" ON "ChessMatch"("whiteRegistrationId");

-- CreateIndex
CREATE INDEX "ChessMatch_blackRegistrationId_idx" ON "ChessMatch"("blackRegistrationId");

-- CreateIndex
CREATE UNIQUE INDEX "ChessMatch_batchId_boardNumber_key" ON "ChessMatch"("batchId", "boardNumber");

-- AddForeignKey
ALTER TABLE "EventRegistration" ADD CONSTRAINT "EventRegistration_withdrawnById_fkey" FOREIGN KEY ("withdrawnById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerGameRating" ADD CONSTRAINT "PlayerGameRating_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerGameRating" ADD CONSTRAINT "PlayerGameRating_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChessRound" ADD CONSTRAINT "ChessRound_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChessRoundBatch" ADD CONSTRAINT "ChessRoundBatch_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "ChessRound"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChessMatch" ADD CONSTRAINT "ChessMatch_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ChessRoundBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChessMatch" ADD CONSTRAINT "ChessMatch_whiteRegistrationId_fkey" FOREIGN KEY ("whiteRegistrationId") REFERENCES "EventRegistration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChessMatch" ADD CONSTRAINT "ChessMatch_blackRegistrationId_fkey" FOREIGN KEY ("blackRegistrationId") REFERENCES "EventRegistration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChessMatch" ADD CONSTRAINT "ChessMatch_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
