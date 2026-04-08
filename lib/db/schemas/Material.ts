import { Schema, type Document } from 'mongoose';

export interface IMaterial extends Document {
  name:                string;
  description?:        string;
  unit:                string;
  category:            string;
  warehouse:           string;
  stockType:           string;
  externalItemName:    string;
  currentStock:        number;
  reorderLevel?:       number;
  unitCost?:           number;
  isActive:            boolean;
  createdAt:           Date;
  updatedAt:           Date;
}

export const MaterialSchema = new Schema<IMaterial>(
  {
    name:                { type: String, required: true, trim: true },
    description:         { type: String, trim: true },
    unit:                { type: String, required: true, trim: true },
    category:            { type: String, required: true, trim: true },
    warehouse:           { type: String, required: true, trim: true },
    stockType:           { type: String, required: true, trim: true },
    externalItemName:    { type: String, required: true, trim: true },
    currentStock:        { type: Number, required: true, default: 0 },
    reorderLevel:        { type: Number },
    unitCost:            { type: Number },
    isActive:            { type: Boolean, default: true },
  },
  { timestamps: true }
);

MaterialSchema.index({ name: 1 }, { unique: true });
