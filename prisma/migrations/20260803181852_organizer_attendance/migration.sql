-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'ORGANIZER';

-- AlterTable
ALTER TABLE "EventRegistration" ADD COLUMN     "attendedAt" TIMESTAMP(3),
ADD COLUMN     "attendedById" TEXT;

-- CreateTable
CREATE TABLE "EventOrganizer" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "EventOrganizer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizerInvite" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "email" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "invitedById" TEXT NOT NULL,

    CONSTRAINT "OrganizerInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EventOrganizer_eventId_userId_key" ON "EventOrganizer"("eventId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizerInvite_tokenHash_key" ON "OrganizerInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "OrganizerInvite_email_idx" ON "OrganizerInvite"("email");

-- AddForeignKey
ALTER TABLE "EventOrganizer" ADD CONSTRAINT "EventOrganizer_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventOrganizer" ADD CONSTRAINT "EventOrganizer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizerInvite" ADD CONSTRAINT "OrganizerInvite_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventRegistration" ADD CONSTRAINT "EventRegistration_attendedById_fkey" FOREIGN KEY ("attendedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
