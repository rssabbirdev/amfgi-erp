import { Schema, model, models, type Document } from 'mongoose';
import type { Permission } from '@/lib/permissions';

export interface IRole extends Document {
  name:        string;
  slug:        string;
  permissions: Permission[];
  isSystem:    boolean;  // true = built-in, cannot be deleted
  createdAt:   Date;
  updatedAt:   Date;
}

const RoleSchema = new Schema<IRole>(
  {
    name:        { type: String, required: true, unique: true, trim: true },
    slug:        { type: String, required: true, unique: true, lowercase: true, trim: true },
    permissions: [{ type: String }],
    isSystem:    { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const Role = models.Role || model<IRole>('Role', RoleSchema);
