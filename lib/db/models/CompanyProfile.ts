import { Schema, model, models, Document } from 'mongoose';

export interface ICompanyProfile extends Document {
  name: string;
  slug: string;
  description?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CompanyProfileSchema = new Schema<ICompanyProfile>(
  {
    name:        { type: String, required: true, unique: true, trim: true },
    slug:        { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, trim: true },
    isActive:    { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const CompanyProfile =
  models.CompanyProfile ||
  model<ICompanyProfile>('CompanyProfile', CompanyProfileSchema);
