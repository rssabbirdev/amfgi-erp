import { Schema, model, models, Document, Types } from 'mongoose';

export interface IMaterial extends Document {
  companyProfileId: Types.ObjectId;
  name: string;
  unit: string;
  category?: string;
  currentStock: number;
  reorderLevel?: number;
  unitCost?: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const MaterialSchema = new Schema<IMaterial>(
  {
    companyProfileId: {
      type: Schema.Types.ObjectId,
      ref: 'CompanyProfile',
      required: true,
      index: true,
    },
    name:         { type: String, required: true, trim: true },
    unit:         { type: String, required: true, trim: true },
    category:     { type: String, trim: true },
    currentStock: { type: Number, required: true, default: 0 },
    reorderLevel: { type: Number },
    unitCost:     { type: Number },
    isActive:     { type: Boolean, default: true },
  },
  { timestamps: true }
);

MaterialSchema.index({ companyProfileId: 1, name: 1 }, { unique: true });

export const Material =
  models.Material || model<IMaterial>('Material', MaterialSchema);
