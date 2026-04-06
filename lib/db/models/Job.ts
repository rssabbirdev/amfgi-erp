import { Schema, model, models, Document, Types } from 'mongoose';

export type JobStatus = 'ACTIVE' | 'COMPLETED' | 'ON_HOLD' | 'CANCELLED';

export interface IJob extends Document {
  companyProfileId: Types.ObjectId;
  jobNumber: string;
  customerId: Types.ObjectId;
  description: string;
  site?: string;
  status: JobStatus;
  startDate?: Date;
  endDate?: Date;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const JobSchema = new Schema<IJob>(
  {
    companyProfileId: {
      type: Schema.Types.ObjectId,
      ref: 'CompanyProfile',
      required: true,
      index: true,
    },
    jobNumber:   { type: String, required: true, trim: true },
    customerId:  { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    description: { type: String, required: true, trim: true },
    site:        { type: String, trim: true },
    status:      {
      type: String,
      enum: ['ACTIVE', 'COMPLETED', 'ON_HOLD', 'CANCELLED'],
      default: 'ACTIVE',
    },
    startDate: { type: Date },
    endDate:   { type: Date },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

JobSchema.index({ companyProfileId: 1, jobNumber: 1 }, { unique: true });

export const Job = models.Job || model<IJob>('Job', JobSchema);
