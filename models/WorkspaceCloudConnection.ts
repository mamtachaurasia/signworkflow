import mongoose, { Document, Schema } from 'mongoose';

import type { CloudConnectionMetadata, CloudProviderId } from '@/lib/cloud/types';

/**
 * A delegated credential owned by a workspace, rather than by the person who
 * completed OAuth. `connectedBy` is retained for accountability only.
 */
export interface IWorkspaceCloudConnection extends Document {
  orgId: mongoose.Types.ObjectId;
  connectedBy: mongoose.Types.ObjectId;
  provider: CloudProviderId;
  providerAccountId: string;
  providerEmail?: string | null;
  displayName?: string | null;
  refreshTokenEncrypted: string;
  scopes: string[];
  metadata: CloudConnectionMetadata;
  lastExportedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const WorkspaceCloudConnectionSchema = new Schema<IWorkspaceCloudConnection>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    connectedBy: { type: Schema.Types.ObjectId, ref: 'Users', required: true },
    provider: { type: String, enum: ['google_drive', 'dropbox'] satisfies CloudProviderId[], required: true },
    providerAccountId: { type: String, required: true, trim: true },
    providerEmail: { type: String, trim: true, lowercase: true, default: null },
    displayName: { type: String, trim: true, default: null },
    refreshTokenEncrypted: { type: String, required: true, select: false },
    scopes: { type: [String], default: [] },
    metadata: { type: Schema.Types.Mixed, default: {} },
    lastExportedAt: { type: Date, default: null },
  },
  { timestamps: true, minimize: false }
);

WorkspaceCloudConnectionSchema.index({ orgId: 1, provider: 1 }, { unique: true });

export default (mongoose.models.WorkspaceCloudConnection as mongoose.Model<IWorkspaceCloudConnection>) ||
  mongoose.model<IWorkspaceCloudConnection>('WorkspaceCloudConnection', WorkspaceCloudConnectionSchema);

