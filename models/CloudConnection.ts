import mongoose, { Document, Schema } from 'mongoose';

import type { CloudConnectionMetadata, CloudProviderId } from '@/lib/cloud/types';

export interface ICloudConnection extends Document {
  userId: mongoose.Types.ObjectId;
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

const CloudConnectionSchema = new Schema<ICloudConnection>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'Users', required: true, index: true },
    provider: {
      type: String,
      enum: ['google_drive', 'dropbox'] satisfies CloudProviderId[],
      required: true,
      index: true,
    },
    providerAccountId: { type: String, required: true, trim: true },
    providerEmail: { type: String, trim: true, lowercase: true, default: null },
    displayName: { type: String, trim: true, default: null },
    refreshTokenEncrypted: { type: String, required: true, select: false },
    scopes: { type: [String], default: [] },
    metadata: { type: Schema.Types.Mixed, default: {} },
    lastExportedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    minimize: false,
  }
);

CloudConnectionSchema.index({ userId: 1, provider: 1 }, { unique: true });

const CloudConnectionModel =
  (mongoose.models.CloudConnection as mongoose.Model<ICloudConnection>) ||
  mongoose.model<ICloudConnection>('CloudConnection', CloudConnectionSchema);

export default CloudConnectionModel;
