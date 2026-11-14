import mongoose, { Schema, Document } from 'mongoose';

export interface LegalHoldCriteria {
  userIds?: string[];
  docTypes?: string[];
  jurisdictions?: string[];
  statuses?: string[];
  createdAfter?: Date;
  createdBefore?: Date;
}

export interface ILegalHold extends Document {
  name: string;
  reason?: string;
  status: 'active' | 'released';
  documentIds: mongoose.Types.ObjectId[];
  criteria?: LegalHoldCriteria;
  createdBy?: string;
  orgId?: mongoose.Types.ObjectId;
  releasedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const LegalHoldCriteriaSchema = new Schema<LegalHoldCriteria>(
  {
    userIds: { type: [String], default: undefined },
    docTypes: { type: [String], default: undefined },
    jurisdictions: { type: [String], default: undefined },
    statuses: { type: [String], default: undefined },
    createdAfter: { type: Date },
    createdBefore: { type: Date },
  },
  { _id: false }
);

const LegalHoldSchema = new Schema<ILegalHold>(
  {
    name: { type: String, required: true },
    orgId: { type: Schema.Types.ObjectId, ref: 'Organization', index: true },
    reason: { type: String },
    status: { type: String, enum: ['active', 'released'], default: 'active' },
    documentIds: { type: [Schema.Types.ObjectId], ref: 'Document', default: [] },
    criteria: { type: LegalHoldCriteriaSchema, default: undefined },
    createdBy: { type: String },
    releasedAt: { type: Date },
  },
  { timestamps: true }
);

LegalHoldSchema.index({ orgId: 1, status: 1, createdAt: -1 });

export default mongoose.models.LegalHold ||
  mongoose.model<ILegalHold>('LegalHold', LegalHoldSchema);
