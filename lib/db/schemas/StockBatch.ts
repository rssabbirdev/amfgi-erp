import { Schema, type Document, type Types } from 'mongoose';

export interface IStockBatch extends Document {
  materialId: Types.ObjectId;
  batchNumber: string; // Unique identifier for this batch
  quantityReceived: number; // Original quantity when received
  quantityAvailable: number; // Current available quantity
  unitCost: number; // Cost per unit when received
  totalCost: number; // quantityReceived × unitCost
  supplier?: string;
  receiptNumber?: string; // GRN/Receipt number
  receivedDate: Date;
  expiryDate?: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export const StockBatchSchema = new Schema<IStockBatch>(
  {
    materialId: {
      type: Schema.Types.ObjectId,
      ref: 'Material',
      required: true,
      index: true,
    },
    batchNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    quantityReceived: {
      type: Number,
      required: true,
      min: 0.001,
    },
    quantityAvailable: {
      type: Number,
      required: true,
      min: 0,
    },
    unitCost: {
      type: Number,
      required: true,
      min: 0,
    },
    totalCost: {
      type: Number,
      required: true,
      min: 0,
    },
    supplier: String,
    receiptNumber: String,
    receivedDate: {
      type: Date,
      required: true,
      index: true,
    },
    expiryDate: Date,
    notes: String,
  },
  { timestamps: true }
);

// Index for FIFO queries
StockBatchSchema.index({ materialId: 1, receivedDate: 1 });
StockBatchSchema.index({ materialId: 1, quantityAvailable: 1 });
