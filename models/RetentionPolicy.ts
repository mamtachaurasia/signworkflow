import mongoose, { Schema, Document } from 'mongoose';

export type RetentionTriggerEvent =
  | 'createdAt'
  | 'completedAt'
  | 'finalizedAt'
  | 'expiresAt'
  | 'custom';

export interface IRetentionPolicy extends Document {
  name: string;
  docType: string;
  jurisdiction: string;
  triggerEvent: RetentionTriggerEvent;
  durationDays: number;
  priority?: number;
  regime?: string;
  active: boolean;
  notes?: string;
  orgId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const RetentionPolicySchema = new Schema<IRetentionPolicy>(
  {
    name: { type: String, required: true },
    orgId: { type: Schema.Types.ObjectId, ref: 'Organization', index: true },
    docType: { type: String, required: true, default: '*' },
    jurisdiction: { type: String, required: true, default: '*' },
    triggerEvent: {
      type: String,
      required: true,
      enum: ['createdAt', 'completedAt', 'finalizedAt', 'expiresAt', 'custom'],
      default: 'completedAt',
    },
    durationDays: { type: Number, required: true },
    priority: { type: Number, default: 0 },
    regime: { type: String },
    active: { type: Boolean, default: true },
    notes: { type: String },
  },
  { timestamps: true }
);

RetentionPolicySchema.index({ orgId: 1, active: 1, docType: 1, jurisdiction: 1, priority: -1 });

export default mongoose.models.RetentionPolicy ||
  mongoose.model<IRetentionPolicy>('RetentionPolicy', RetentionPolicySchema);
