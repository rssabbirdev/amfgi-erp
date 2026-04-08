import { Schema, type Document } from 'mongoose';

export interface IUnit extends Document {
  name: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const UnitSchema = new Schema<IUnit>(
  {
    name: { type: String, required: true, trim: true, index: true },
    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

UnitSchema.index({ name: 1 }, { unique: true });
