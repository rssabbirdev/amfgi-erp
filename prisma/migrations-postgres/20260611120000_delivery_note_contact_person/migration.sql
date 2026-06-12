-- DeliveryNote.contactPerson: structured contact for print/dispatch (was in schema, missing from DB).
ALTER TABLE "DeliveryNote" ADD COLUMN IF NOT EXISTS "contactPerson" TEXT;
