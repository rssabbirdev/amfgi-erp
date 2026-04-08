import { Schema, type Document } from 'mongoose';

export interface IMaterialLog extends Document {
  materialId: string;
  action: 'created' | 'updated';
  changes: Record<string, any>;
  changedBy: string;
  timestamp: Date;
}

export const MaterialLogSchema = new Schema<IMaterialLog>(
  {
    materialId: { type: String, required: true, index: true },
    action: { type: String, enum: ['created', 'updated'], required: true },
    changes: { type: Schema.Types.Mixed, required: true },
    changedBy: { type: String, required: true },
    timestamp: { type: Date, default: () => new Date(), index: true },
  },
  { timestamps: false }
);

MaterialLogSchema.index({ materialId: 1, timestamp: -1 });
