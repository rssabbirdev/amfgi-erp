-- CreateTable
CREATE TABLE "LiveUpdateEvent" (
    "id" BIGSERIAL NOT NULL,
    "companyId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiveUpdateEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LiveUpdateEvent_companyId_channel_id_idx" ON "LiveUpdateEvent"("companyId", "channel", "id");

-- CreateIndex
CREATE INDEX "LiveUpdateEvent_createdAt_idx" ON "LiveUpdateEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "LiveUpdateEvent" ADD CONSTRAINT "LiveUpdateEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
