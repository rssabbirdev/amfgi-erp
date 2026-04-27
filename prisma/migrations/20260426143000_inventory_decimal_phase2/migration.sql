ALTER TABLE `Material`
  MODIFY `currentStock` DECIMAL(18, 3) NOT NULL DEFAULT 0,
  MODIFY `reorderLevel` DECIMAL(18, 3) NULL,
  MODIFY `unitCost` DECIMAL(18, 4) NULL;

ALTER TABLE `StockBatch`
  MODIFY `quantityReceived` DECIMAL(18, 3) NOT NULL,
  MODIFY `quantityAvailable` DECIMAL(18, 3) NOT NULL,
  MODIFY `unitCost` DECIMAL(18, 4) NOT NULL,
  MODIFY `totalCost` DECIMAL(18, 4) NOT NULL;

ALTER TABLE `Transaction`
  MODIFY `quantity` DECIMAL(18, 3) NOT NULL,
  MODIFY `totalCost` DECIMAL(18, 4) NOT NULL DEFAULT 0,
  MODIFY `averageCost` DECIMAL(18, 4) NOT NULL DEFAULT 0;

ALTER TABLE `TransactionBatch`
  MODIFY `quantityFromBatch` DECIMAL(18, 3) NOT NULL,
  MODIFY `unitCost` DECIMAL(18, 4) NOT NULL,
  MODIFY `costAmount` DECIMAL(18, 4) NOT NULL;

ALTER TABLE `PriceLog`
  MODIFY `previousPrice` DECIMAL(18, 4) NOT NULL,
  MODIFY `currentPrice` DECIMAL(18, 4) NOT NULL;
