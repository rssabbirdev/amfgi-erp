-- CreateTable
CREATE TABLE "UserTablePreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "state" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserTablePreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserTablePreference_userId_companyId_key_key" ON "UserTablePreference"("userId", "companyId", "key");

-- CreateIndex
CREATE INDEX "UserTablePreference_companyId_key_idx" ON "UserTablePreference"("companyId", "key");

-- AddForeignKey
ALTER TABLE "UserTablePreference" ADD CONSTRAINT "UserTablePreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTablePreference" ADD CONSTRAINT "UserTablePreference_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
