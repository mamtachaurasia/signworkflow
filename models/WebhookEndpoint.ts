import mongoose, { Document, Schema } from 'mongoose';

export type WebhookSignatureVersion = 'v1' | 'v2';
export type WebhookEventContractVersion = 'v1';

export interface IWebhookEndpoint extends Document {
  orgId: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;
  url: string;
  secretHash: string;
  secretEncrypted: string;
  secretPrefix: string;
  signatureVersion: WebhookSignatureVersion;
  eventContractVersion?: WebhookEventContractVersion;
  events: string[];
  active: boolean;
  pausedAt?: Date | null;
  revokedAt?: Date | null;
  failureCount: number;
  lastDeliveredAt?: Date | null;
  lastStatusCode?: number | null;
  createdAt: Date;
  updatedAt: Date;
}

const WebhookEndpointSchema = new Schema<IWebhookEndpoint>({
  orgId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'Users', required: true },
  url: { type: String, required: true, trim: true, maxlength: 2048 },
  secretHash: { type: String, required: true },
  secretEncrypted: { type: String, required: true, select: false },
  secretPrefix: { type: String, required: true },
  // v1 is the compatibility default for records created before timestamped
  // signatures were introduced. New endpoints are explicitly created as v2.
  signatureVersion: { type: String, enum: ['v1', 'v2'], default: 'v1' },
  // Leave the default unset so pre-contract records retain their legacy event
  // filtering behavior. Newly created endpoints explicitly use v1.
  eventContractVersion: { type: String, enum: ['v1'], default: undefined },
  events: { type: [String], default: ['*'] },
  active: { type: Boolean, default: true, index: true },
  pausedAt: { type: Date, default: null },
  revokedAt: { type: Date, default: null, index: true },
  failureCount: { type: Number, default: 0 },
  lastDeliveredAt: { type: Date, default: null },
  lastStatusCode: { type: Number, default: null },
}, { timestamps: true });

WebhookEndpointSchema.index({ orgId: 1, createdAt: -1 });

export default mongoose.models.WebhookEndpoint || mongoose.model<IWebhookEndpoint>('WebhookEndpoint', WebhookEndpointSchema);
