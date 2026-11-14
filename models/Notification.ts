import mongoose, { Document, Schema } from 'mongoose';

export const NOTIFICATION_TYPES = [
  'document.sent',
  'document.viewed',
  'document.signed',
  'document.completed',
  'document.declined',
  'document.voided',
  'system',
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface INotification extends Document {
  userId: mongoose.Types.ObjectId;
  orgId?: mongoose.Types.ObjectId | null;
  documentId?: mongoose.Types.ObjectId | null;
  type: NotificationType;
  title: string;
  body: string;
  href?: string;
  actorName?: string;
  actorEmail?: string;
  metadata?: Record<string, unknown>;
  dedupeKey?: string;
  readAt?: Date | null;
  archivedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'Users', required: true, index: true },
    orgId: { type: Schema.Types.ObjectId, ref: 'Organization', default: null, index: true },
    documentId: { type: Schema.Types.ObjectId, ref: 'Document', default: null, index: true },
    type: {
      type: String,
      enum: NOTIFICATION_TYPES,
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    body: { type: String, required: true, trim: true, maxlength: 600 },
    href: { type: String, trim: true, maxlength: 500, default: '' },
    actorName: { type: String, trim: true, maxlength: 200, default: '' },
    actorEmail: { type: String, trim: true, lowercase: true, maxlength: 320, default: '' },
    metadata: { type: Schema.Types.Mixed, default: {} },
    dedupeKey: { type: String, trim: true, maxlength: 300, default: undefined },
    readAt: { type: Date, default: null, index: true },
    archivedAt: { type: Date, default: null, index: true },
  },
  {
    timestamps: true,
    minimize: false,
  }
);

NotificationSchema.index({ userId: 1, archivedAt: 1, readAt: 1, createdAt: -1 });
NotificationSchema.index({ userId: 1, createdAt: -1 });
NotificationSchema.index(
  { userId: 1, dedupeKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      dedupeKey: { $type: 'string' },
    },
  }
);

const NotificationModel =
  (mongoose.models.Notification as mongoose.Model<INotification>) ||
  mongoose.model<INotification>('Notification', NotificationSchema);

export default NotificationModel;
