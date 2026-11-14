import mongoose, { Document, Schema } from 'mongoose';

export interface IApiKey extends Document {
  orgId: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;
  name: string;
  prefix: string;
  secretHash: string;
  scopes: string[];
  lastUsedAt?: Date | null;
  revokedAt?: Date | null;
  expiresAt?: Date | null;
  allowedIpCidrs: string[];
  maxRequestsPerMinute: number;
  rotationIntervalDays?: number | null;
  rotationDueAt?: Date | null;
  rotatedAt?: Date | null;
  rotatedFrom?: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const ApiKeySchema = new Schema<IApiKey>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'Users', required: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    prefix: { type: String, required: true, trim: true, index: true },
    secretHash: { type: String, required: true, select: false, unique: true },
    scopes: { type: [String], default: ['documents:read'] },
    lastUsedAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null, index: true },
    expiresAt: { type: Date, default: null, index: true },
    allowedIpCidrs: { type: [String], default: [] },
    maxRequestsPerMinute: { type: Number, default: 600, min: 1, max: 600 },
    rotationIntervalDays: { type: Number, default: null, min: 1, max: 365 },
    rotationDueAt: { type: Date, default: null },
    rotatedAt: { type: Date, default: null },
    rotatedFrom: { type: Schema.Types.ObjectId, ref: 'ApiKey', default: null },
  },
  { timestamps: true }
);

ApiKeySchema.index({ orgId: 1, createdAt: -1 });
ApiKeySchema.index({ orgId: 1, expiresAt: 1, revokedAt: 1 });

export default mongoose.models.ApiKey || mongoose.model<IApiKey>('ApiKey', ApiKeySchema);
