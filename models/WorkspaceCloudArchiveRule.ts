import mongoose, { Document, Schema } from 'mongoose';

import type { CloudProviderId } from '@/lib/cloud/types';

export interface IWorkspaceCloudArchiveRule extends Document {
  orgId: mongoose.Types.ObjectId;
  connectionId: mongoose.Types.ObjectId;
  configuredBy: mongoose.Types.ObjectId;
  provider: CloudProviderId;
  enabled: boolean;
  destinationFolder?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const WorkspaceCloudArchiveRuleSchema = new Schema<IWorkspaceCloudArchiveRule>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    connectionId: { type: Schema.Types.ObjectId, ref: 'WorkspaceCloudConnection', required: true },
    configuredBy: { type: Schema.Types.ObjectId, ref: 'Users', required: true },
    provider: { type: String, enum: ['google_drive', 'dropbox'] satisfies CloudProviderId[], required: true },
    enabled: { type: Boolean, default: false, index: true },
    destinationFolder: { type: String, trim: true, maxlength: 500, default: null },
  },
  { timestamps: true }
);

WorkspaceCloudArchiveRuleSchema.index({ orgId: 1, provider: 1 }, { unique: true });
WorkspaceCloudArchiveRuleSchema.index({ orgId: 1, enabled: 1 });

export default (mongoose.models.WorkspaceCloudArchiveRule as mongoose.Model<IWorkspaceCloudArchiveRule>) ||
  mongoose.model<IWorkspaceCloudArchiveRule>('WorkspaceCloudArchiveRule', WorkspaceCloudArchiveRuleSchema);

