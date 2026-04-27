-- Phase 5B: convert work assignment production quantities to Decimal

ALTER TABLE `WorkAssignment`
  MODIFY `targetQty` DECIMAL(18,3) NULL,
  MODIFY `achievedQty` DECIMAL(18,3) NULL;
