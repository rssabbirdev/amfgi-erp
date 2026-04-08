import { Schema, type Document } from 'mongoose';

export interface IWarehouse extends Document {
  name: string;
  location?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const WarehouseSchema = new Schema<IWarehouse>(
  {
    name: { type: String, required: true, trim: true, index: true },
    location: { type: String, trim: true },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

WarehouseSchema.index({ name: 1 }, { unique: true });
