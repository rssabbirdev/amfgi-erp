import { Schema, model, models, type Document, type Types } from 'mongoose';

export interface ICompanyAccess {
  companyId: Types.ObjectId;
  roleId:    Types.ObjectId;
}

export interface IUser extends Document {
  name:            string;
  email:           string;
  password?:       string;
  image?:          string;
  isSuperAdmin:    boolean;
  isActive:        boolean;
  companyAccess:   ICompanyAccess[];
  activeCompanyId?: Types.ObjectId;
  createdAt:       Date;
  updatedAt:       Date;
}

const CompanyAccessSchema = new Schema<ICompanyAccess>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    roleId:    { type: Schema.Types.ObjectId, ref: 'Role',    required: true },
  },
  { _id: false }
);

const UserSchema = new Schema<IUser>(
  {
    name:            { type: String, required: true, trim: true },
    email:           { type: String, required: true, unique: true, lowercase: true, trim: true },
    password:        { type: String, select: false },
    image:           { type: String },
    isSuperAdmin:    { type: Boolean, default: false },
    isActive:        { type: Boolean, default: true },
    companyAccess:   { type: [CompanyAccessSchema], default: [] },
    activeCompanyId: { type: Schema.Types.ObjectId, ref: 'Company', default: null },
  },
  { timestamps: true }
);

export const User = models.User || model<IUser>('User', UserSchema);
