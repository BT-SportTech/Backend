-- AlterTable
ALTER TABLE "EventRegistration" ADD COLUMN "amountPaid" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "EventRegistration" ADD COLUMN "paymentRef" TEXT;
ALTER TABLE "EventRegistration" ADD COLUMN "paidAt" TIMESTAMP(3);
ALTER TABLE "EventRegistration" ADD COLUMN "paymentMethod" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "EventRegistration_paymentRef_key" ON "EventRegistration"("paymentRef");
