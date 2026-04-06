import { Schema, type Document, type Types } from 'mongoose';

export type JobStatus = 'ACTIVE' | 'COMPLETED' | 'ON_HOLD' | 'CANCELLED';

export interface IJob extends Document {
  jobNumber:   string;
  customerId:  Types.ObjectId;
  description: string;
  site?:       string;
  status:      JobStatus;
  startDate?:  Date;
  endDate?:    Date;
  createdBy:   string; // user ID from system DB (string ref, cross-DB)
  createdAt:   Date;
  updatedAt:   Date;
}

export const JobSchema = new Schema<IJob>(
  {
    jobNumber:   { type: String, required: true, trim: true, unique: true },
    customerId:  { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    description: { type: String, required: true, trim: true },
    site:        { type: String, trim: true },
    status:      {
      type:    String,
      enum:    ['ACTIVE', 'COMPLETED', 'ON_HOLD', 'CANCELLED'],
      default: 'ACTIVE',
    },
    startDate: { type: Date },
    endDate:   { type: Date },
    createdBy: { type: String, required: true }, // string — cross-DB reference
  },
  { timestamps: true }
);
