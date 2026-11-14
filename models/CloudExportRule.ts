import mongoose, { Document, Schema } from 'mongoose';

import type { CloudProviderId } from '@/lib/cloud/types';

export interface ICloudExportRule extends Document {
  orgId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  provider: CloudProviderId;
  enabled: boolean;
  destinationFolder?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const CloudExportRuleSchema = new Schema<ICloudExportRule>({
  orgId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  userId: { type: Schema.Types.ObjectId, ref: 'Users', required: true, index: true },
  provider: { type: String, enum: ['google_drive', 'dropbox'], required: true },
  enabled: { type: Boolean, default: false, index: true },
  destinationFolder: { type: String, trim: true, maxlength: 500, default: null },
}, { timestamps: true });

CloudExportRuleSchema.index({ orgId: 1, userId: 1, provider: 1 }, { unique: true });
CloudExportRuleSchema.index({ orgId: 1, enabled: 1 });

export default mongoose.models.CloudExportRule || mongoose.model<ICloudExportRule>('CloudExportRule', CloudExportRuleSchema);
