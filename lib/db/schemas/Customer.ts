import { Schema, type Document } from 'mongoose';

export interface ICustomer extends Document {
  name:          string;
  contactPerson?: string;
  phone?:        string;
  email?:        string;
  address?:      string;
  isActive:      boolean;
  createdAt:     Date;
  updatedAt:     Date;
}

export const CustomerSchema = new Schema<ICustomer>(
  {
    name:          { type: String, required: true, trim: true, unique: true },
    contactPerson: { type: String, trim: true },
    phone:         { type: String, trim: true },
    email:         { type: String, lowercase: true, trim: true },
    address:       { type: String, trim: true },
    isActive:      { type: Boolean, default: true },
  },
  { timestamps: true }
);
