-- Drop deprecated expected shift columns; attendance duration uses punches only.
ALTER TABLE "AttendanceEntry" DROP COLUMN IF EXISTS "expectedShiftStart";
ALTER TABLE "AttendanceEntry" DROP COLUMN IF EXISTS "expectedShiftEnd";
