import { Schema, model, models, Document, Types } from 'mongoose';

export type UserRole = 'SUPER_ADMIN' | 'MANAGER' | 'STORE_KEEPER';

export interface IUser extends Document {
  name: string;
  email: string;
  password?: string;
  image?: string;
  role: UserRole;
  allowedProfiles: Types.ObjectId[];
  activeProfile?: Types.ObjectId;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    name:            { type: String, required: true, trim: true },
    email:           { type: String, required: true, unique: true, lowercase: true, trim: true },
    password:        { type: String, select: false },
    image:           { type: String },
    role:            {
      type: String,
      enum: ['SUPER_ADMIN', 'MANAGER', 'STORE_KEEPER'],
      required: true,
      default: 'STORE_KEEPER',
    },
    allowedProfiles: [{ type: Schema.Types.ObjectId, ref: 'CompanyProfile' }],
    activeProfile:   { type: Schema.Types.ObjectId, ref: 'CompanyProfile', default: null },
    isActive:        { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const User = models.User || model<IUser>('User', UserSchema);
