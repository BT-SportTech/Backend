-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "gameId" TEXT,
ALTER COLUMN "state" DROP NOT NULL,
ALTER COLUMN "district" DROP NOT NULL;

-- CreateTable
CREATE TABLE "Game" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "imageUrl" TEXT,
    "sidesPerMatch" INTEGER NOT NULL DEFAULT 2,
    "playersPerSide" INTEGER NOT NULL,
    "winPoints" INTEGER NOT NULL DEFAULT 0,
    "lossPoints" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Game_name_key" ON "Game"("name");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE SET NULL ON UPDATE CASCADE;
