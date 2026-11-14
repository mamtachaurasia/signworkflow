import mongoose, { Document, Schema } from 'mongoose';

export interface IBillingWebhookEvent extends Document {
  provider: 'razorpay' | 'paypal';
  eventId: string;
  type: string;
  status: 'processed' | 'failed';
  orgId?: mongoose.Types.ObjectId | null;
  subscriptionId?: string | null;
  errorMessage?: string | null;
  processedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const BillingWebhookEventSchema = new Schema<IBillingWebhookEvent>(
  {
    provider: {
      type: String,
      enum: ['razorpay', 'paypal'],
      required: true,
      index: true,
    },
    eventId: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['processed', 'failed'],
      required: true,
      default: 'processed',
    },
    orgId: { type: Schema.Types.ObjectId, ref: 'Organization', default: null },
    subscriptionId: { type: String, default: null },
    errorMessage: { type: String, default: null },
    processedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

BillingWebhookEventSchema.index({ provider: 1, eventId: 1 }, { unique: true });

export default mongoose.models.BillingWebhookEvent ||
  mongoose.model<IBillingWebhookEvent>('BillingWebhookEvent', BillingWebhookEventSchema);
