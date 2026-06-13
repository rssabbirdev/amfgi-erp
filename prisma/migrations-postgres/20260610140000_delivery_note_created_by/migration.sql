ALTER TABLE "DeliveryNote" ADD COLUMN IF NOT EXISTS "createdByUserId" TEXT;
ALTER TABLE "DeliveryNote" ADD COLUMN IF NOT EXISTS "createdByName" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DeliveryNote_createdByUserId_fkey') THEN
    ALTER TABLE "DeliveryNote" ADD CONSTRAINT "DeliveryNote_createdByUserId_fkey"
      FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
