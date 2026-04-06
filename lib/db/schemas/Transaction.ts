import { Schema, type Document, type Types } from 'mongoose';

export type TransactionType = 'STOCK_IN' | 'STOCK_OUT' | 'RETURN' | 'TRANSFER_IN' | 'TRANSFER_OUT';

export interface ITransaction extends Document {
  type:                TransactionType;
  materialId:          Types.ObjectId;
  quantity:            number;
  jobId?:              Types.ObjectId;
  parentTransactionId?: Types.ObjectId;
  // For inter-company transfers — the counterpart company slug
  counterpartCompany?: string;
  notes?:              string;
  date:                Date;
  performedBy:         string; // user ID (string — cross-DB)
  createdAt:           Date;
  updatedAt:           Date;
}

export const TransactionSchema = new Schema<ITransaction>(
  {
    type: {
      type: String,
      enum: ['STOCK_IN', 'STOCK_OUT', 'RETURN', 'TRANSFER_IN', 'TRANSFER_OUT'],
      required: true,
    },
    materialId:          { type: Schema.Types.ObjectId, ref: 'Material', required: true },
    quantity:            { type: Number, required: true, min: 0.001 },
    jobId:               { type: Schema.Types.ObjectId, ref: 'Job', default: null },
    parentTransactionId: { type: Schema.Types.ObjectId, default: null },
    counterpartCompany:  { type: String },
    notes:               { type: String, trim: true },
    date:                { type: Date, required: true, default: Date.now },
    performedBy:         { type: String, required: true },
  },
  { timestamps: true }
);

TransactionSchema.index({ date: -1 });
TransactionSchema.index({ jobId: 1, materialId: 1 });
TransactionSchema.index({ materialId: 1, type: 1 });
