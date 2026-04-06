import { Schema, model, models, Document, Types } from 'mongoose';

export type TransactionType = 'STOCK_IN' | 'STOCK_OUT' | 'RETURN';

export interface ITransaction extends Document {
  companyProfileId: Types.ObjectId;
  type: TransactionType;
  materialId: Types.ObjectId;
  quantity: number;
  jobId?: Types.ObjectId;
  parentTransactionId?: Types.ObjectId;
  notes?: string;
  date: Date;
  performedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const TransactionSchema = new Schema<ITransaction>(
  {
    companyProfileId: {
      type: Schema.Types.ObjectId,
      ref: 'CompanyProfile',
      required: true,
      index: true,
    },
    type:                { type: String, enum: ['STOCK_IN', 'STOCK_OUT', 'RETURN'], required: true },
    materialId:          { type: Schema.Types.ObjectId, ref: 'Material', required: true },
    quantity:            { type: Number, required: true, min: 0.001 },
    jobId:               { type: Schema.Types.ObjectId, ref: 'Job', default: null },
    parentTransactionId: { type: Schema.Types.ObjectId, ref: 'Transaction', default: null },
    notes:               { type: String, trim: true },
    date:                { type: Date, required: true, default: Date.now },
    performedBy:         { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

TransactionSchema.index({ companyProfileId: 1, date: -1 });
TransactionSchema.index({ jobId: 1, materialId: 1 });
TransactionSchema.index({ materialId: 1, type: 1 });

export const Transaction =
  models.Transaction || model<ITransaction>('Transaction', TransactionSchema);
