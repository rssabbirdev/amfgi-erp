import { Schema, model, models, type Document } from 'mongoose';

export interface ICompany extends Document {
  name:        string;
  slug:        string;   // "amfgi", "km"
  dbName:      string;   // actual MongoDB database name, e.g. "company_amfgi"
  description?: string;
  isActive:    boolean;
  createdAt:   Date;
  updatedAt:   Date;
}

const CompanySchema = new Schema<ICompany>(
  {
    name:        { type: String, required: true, unique: true, trim: true },
    slug:        { type: String, required: true, unique: true, lowercase: true, trim: true },
    dbName:      { type: String, required: true, unique: true, trim: true },
    description: { type: String, trim: true },
    isActive:    { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Company =
  models.Company || model<ICompany>('Company', CompanySchema);
