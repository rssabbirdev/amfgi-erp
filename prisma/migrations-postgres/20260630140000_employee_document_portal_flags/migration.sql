-- Per-document employee portal visibility and download controls
ALTER TABLE "EmployeeDocument" ADD COLUMN IF NOT EXISTS "portalViewEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "EmployeeDocument" ADD COLUMN IF NOT EXISTS "portalDownloadEnabled" BOOLEAN NOT NULL DEFAULT false;
