-- CreateEnum
CREATE TYPE "ScheduledPushType" AS ENUM ('EVENT_START_1H', 'EVENT_ATTENDANCE_OPEN');

-- CreateEnum
CREATE TYPE "ScheduledPushStatus" AS ENUM ('PENDING', 'SENT', 'SKIPPED', 'FAILED');

-- CreateTable
CREATE TABLE "ScheduledPush" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "type" "ScheduledPushType" NOT NULL,
    "sendAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "status" "ScheduledPushStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledPush_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScheduledPush_status_sendAt_idx" ON "ScheduledPush"("status", "sendAt");

-- CreateIndex
CREATE UNIQUE INDEX "ScheduledPush_userId_eventId_type_key" ON "ScheduledPush"("userId", "eventId", "type");

-- AddForeignKey
ALTER TABLE "ScheduledPush" ADD CONSTRAINT "ScheduledPush_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledPush" ADD CONSTRAINT "ScheduledPush_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
