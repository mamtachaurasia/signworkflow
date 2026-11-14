import mongoose, { Document, Schema } from 'mongoose';

export interface IAuditLog extends Document {
  integrationPending?: boolean;
  integrationNextAttemptAt?: Date;
  integrationLastError?: string;
  userId?: mongoose.Types.ObjectId | null;
  orgId?: mongoose.Types.ObjectId | null;
  action: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  chainScope?: 'document' | 'org' | 'user' | 'system';
  chainId?: string;
  prevHash?: string;
  hash?: string;
  // Legacy document-audit fields retained for existing routes.
  documentId?: mongoose.Types.ObjectId;
  actor?: string;
  timestamp?: Date;
}

const AuditLogSchema: Schema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'Users', index: true, default: null },
    orgId: { type: Schema.Types.ObjectId, ref: 'Organization', index: true, default: null },
    action: { type: String, required: true, index: true },
    ipAddress: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    metadata: { type: Schema.Types.Mixed, default: {} },
    createdAt: {
      type: Date,
      default: Date.now,
      immutable: true,
      index: true,
    },
    chainScope: {
      type: String,
      enum: ['document', 'org', 'user', 'system'],
      default: 'system',
      index: true,
    },
    chainId: { type: String, default: 'system', index: true },
    prevHash: { type: String, default: '' },
    hash: { type: String, default: '' },
    integrationPending: { type: Boolean, default: true, select: false, index: true },
    integrationNextAttemptAt: { type: Date, default: Date.now, select: false },
    integrationLastError: { type: String, select: false },
    documentId: { type: Schema.Types.ObjectId, ref: 'Document', index: true },
    actor: { type: String },
    timestamp: { type: Date },
  },
  { minimize: false }
);

AuditLogSchema.index({ chainScope: 1, chainId: 1, createdAt: 1 });

const AuditLogModel =
  (mongoose.models.AuditLog as mongoose.Model<IAuditLog>) ||
  mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);

export default AuditLogModel;
