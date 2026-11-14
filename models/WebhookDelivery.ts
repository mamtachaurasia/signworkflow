import mongoose, { Document, Schema } from 'mongoose';

export type WebhookDeliveryStatus = 'pending' | 'paused' | 'processing' | 'delivered' | 'failed' | 'dead_letter';

export type WebhookAttempt = {
  sequence: number;
  startedAt: Date;
  finishedAt: Date | null;
  outcome: 'processing' | 'delivered' | 'failed' | 'interrupted';
  statusCode: number | null;
  error: string | null;
};

export interface IWebhookDelivery extends Document {
  orgId: mongoose.Types.ObjectId;
  endpointId: mongoose.Types.ObjectId;
  eventId: string;
  event: string;
  payload: Record<string, unknown>;
  status: WebhookDeliveryStatus;
  attempts: number;
  attemptHistory: WebhookAttempt[];
  maxAttempts: number;
  nextAttemptAt: Date;
  lockedAt?: Date | null;
  pausedStateCheckedAt?: Date | null;
  lastAttemptAt?: Date | null;
  deliveredAt?: Date | null;
  lastStatusCode?: number | null;
  lastError?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const WebhookDeliverySchema = new Schema<IWebhookDelivery>({
  orgId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
  endpointId: { type: Schema.Types.ObjectId, ref: 'WebhookEndpoint', required: true, index: true },
  eventId: { type: String, required: true, maxlength: 120 },
  event: { type: String, required: true, maxlength: 120, index: true },
  payload: { type: Schema.Types.Mixed, required: true },
  // Paused deliveries deliberately remain durable but are excluded from the
  // worker claim query until their endpoint is resumed.
  status: { type: String, enum: ['pending', 'paused', 'processing', 'delivered', 'failed', 'dead_letter'], default: 'pending', index: true },
  attempts: { type: Number, default: 0 },
  attemptHistory: { type: [new Schema<WebhookAttempt>({
    sequence: { type: Number, required: true },
    startedAt: { type: Date, required: true },
    finishedAt: { type: Date, default: null },
    outcome: { type: String, enum: ['processing', 'delivered', 'failed', 'interrupted'], required: true },
    statusCode: { type: Number, default: null },
    error: { type: String, maxlength: 1000, default: null },
  }, { _id: false })], default: [] },
  maxAttempts: { type: Number, default: 8 },
  nextAttemptAt: { type: Date, default: Date.now, index: true },
  lockedAt: { type: Date, default: null },
  pausedStateCheckedAt: { type: Date, default: null },
  lastAttemptAt: { type: Date, default: null },
  deliveredAt: { type: Date, default: null },
  lastStatusCode: { type: Number, default: null },
  lastError: { type: String, default: null, maxlength: 1000 },
}, { timestamps: true });

WebhookDeliverySchema.index({ status: 1, nextAttemptAt: 1, createdAt: 1 });
WebhookDeliverySchema.index({ status: 1, pausedStateCheckedAt: 1, createdAt: 1 });
WebhookDeliverySchema.index({ status: 1, lockedAt: 1, createdAt: 1 });
WebhookDeliverySchema.index({ endpointId: 1, eventId: 1 }, { unique: true });
WebhookDeliverySchema.index({ endpointId: 1, status: 1, pausedStateCheckedAt: 1 });
WebhookDeliverySchema.index({ orgId: 1, createdAt: -1 });
WebhookDeliverySchema.index({ orgId: 1, createdAt: -1, _id: -1 });
WebhookDeliverySchema.index({ orgId: 1, status: 1, createdAt: -1, _id: -1 });
WebhookDeliverySchema.index({ orgId: 1, endpointId: 1, status: 1, createdAt: -1, _id: -1 });

export default mongoose.models.WebhookDelivery || mongoose.model<IWebhookDelivery>('WebhookDelivery', WebhookDeliverySchema);
