import { Schema, model, models, Document, Types } from 'mongoose';

export interface ICustomer extends Document {
  companyProfileId: Types.ObjectId;
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CustomerSchema = new Schema<ICustomer>(
  {
    companyProfileId: {
      type: Schema.Types.ObjectId,
      ref: 'CompanyProfile',
      required: true,
      index: true,
    },
    name:          { type: String, required: true, trim: true },
    contactPerson: { type: String, trim: true },
    phone:         { type: String, trim: true },
    email:         { type: String, lowercase: true, trim: true },
    address:       { type: String, trim: true },
    isActive:      { type: Boolean, default: true },
  },
  { timestamps: true }
);

CustomerSchema.index({ companyProfileId: 1, name: 1 }, { unique: true });

export const Customer =
  models.Customer || model<ICustomer>('Customer', CustomerSchema);
