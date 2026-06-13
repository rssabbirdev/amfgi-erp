-- Allow multiple roles per user per company (union permissions at runtime).
DROP INDEX IF EXISTS "UserCompanyAccess_userId_companyId_key";

CREATE UNIQUE INDEX "UserCompanyAccess_userId_companyId_roleId_key"
  ON "UserCompanyAccess"("userId", "companyId", "roleId");

CREATE INDEX "UserCompanyAccess_userId_companyId_idx"
  ON "UserCompanyAccess"("userId", "companyId");
