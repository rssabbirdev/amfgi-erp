import { Schema, type Document } from 'mongoose';

export interface IPriceLog extends Document {
  materialId: string;
  previousPrice: number;
  currentPrice: number;
  source: 'manual' | 'bill';
  changedBy: string;
  billId?: string;
  notes?: string;
  timestamp: Date;
}

export const PriceLogSchema = new Schema<IPriceLog>(
  {
    materialId: { type: String, required: true, index: true },
    previousPrice: { type: Number, required: true },
    currentPrice: { type: Number, required: true },
    source: { type: String, enum: ['manual', 'bill'], required: true },
    changedBy: { type: String, required: true },
    billId: { type: String },
    notes: { type: String },
    timestamp: { type: Date, default: () => new Date(), index: true },
  },
  { timestamps: false }
);

PriceLogSchema.index({ materialId: 1, timestamp: -1 });
