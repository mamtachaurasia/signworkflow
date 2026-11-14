import mongoose, { Document, Schema } from 'mongoose';

import type { CloudProviderId } from '@/lib/cloud/types';

export type WorkspaceCloudArchiveJobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'dead_letter';

export interface IWorkspaceCloudArchiveJob extends Document {
  integrationOutbox?: Record<string, unknown>;
  integrationNextAttemptAt?: Date;
  integrationLastError?: string;
  orgId: mongoose.Types.ObjectId;
  ruleId: mongoose.Types.ObjectId;
  documentId: mongoose.Types.ObjectId;
  provider: CloudProviderId;
  destinationFolder?: string | null;
  status: WorkspaceCloudArchiveJobStatus;
  attempts: number;
  maxAttempts: number;
  nextAttemptAt: Date;
  lockedAt?: Date | null;
  completedAt?: Date | null;
  providerFileId?: string | null;
  providerUrl?: string | null;
  lastError?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const WorkspaceCloudArchiveJobSchema = new Schema<IWorkspaceCloudArchiveJob>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    ruleId: { type: Schema.Types.ObjectId, ref: 'WorkspaceCloudArchiveRule', required: true, index: true },
    documentId: { type: Schema.Types.ObjectId, ref: 'Document', required: true, index: true },
    provider: { type: String, enum: ['google_drive', 'dropbox'] satisfies CloudProviderId[], required: true },
    destinationFolder: { type: String, trim: true, maxlength: 500, default: null },
    status: { type: String, enum: ['pending', 'processing', 'completed', 'failed', 'dead_letter'], default: 'pending', index: true },
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 8 },
    nextAttemptAt: { type: Date, default: Date.now, index: true },
    lockedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    providerFileId: { type: String, default: null },
    providerUrl: { type: String, default: null },
    integrationOutbox: { type: Schema.Types.Mixed, select: false },
    integrationNextAttemptAt: { type: Date, select: false, index: true },
    integrationLastError: { type: String, select: false },
    lastError: { type: String, maxlength: 1000, default: null },
  },
  { timestamps: true }
);

WorkspaceCloudArchiveJobSchema.index({ status: 1, nextAttemptAt: 1, createdAt: 1 });
WorkspaceCloudArchiveJobSchema.index({ ruleId: 1, documentId: 1 }, { unique: true });
WorkspaceCloudArchiveJobSchema.index({ orgId: 1, createdAt: -1 });
WorkspaceCloudArchiveJobSchema.index({ orgId: 1, createdAt: -1, _id: -1 });
WorkspaceCloudArchiveJobSchema.index({ orgId: 1, status: 1, createdAt: -1, _id: -1 });

export default (mongoose.models.WorkspaceCloudArchiveJob as mongoose.Model<IWorkspaceCloudArchiveJob>) ||
  mongoose.model<IWorkspaceCloudArchiveJob>('WorkspaceCloudArchiveJob', WorkspaceCloudArchiveJobSchema);
