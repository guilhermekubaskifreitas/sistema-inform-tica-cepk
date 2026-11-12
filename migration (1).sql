-- AlterTable
ALTER TABLE "reservations" ADD COLUMN "seriesId" VARCHAR(36);

-- CreateTable
CREATE TABLE "reservation_approval_tokens" (
    "id" TEXT NOT NULL,
    "seriesId" VARCHAR(36) NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reservation_approval_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reservations_seriesId_idx" ON "reservations"("seriesId");

-- CreateIndex
CREATE UNIQUE INDEX "reservation_approval_tokens_tokenHash_key" ON "reservation_approval_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "reservation_approval_tokens_seriesId_idx" ON "reservation_approval_tokens"("seriesId");
