import mongoose, { Document, Schema } from 'mongoose';

export type MembershipRole = 'owner' | 'admin' | 'auditor' | 'user';
export type MembershipStatus = 'active' | 'invited' | 'disabled';
export type MembershipDisabledReason = 'user_deleted' | 'admin' | 'billing' | 'other';

export interface IMembership extends Document {
  orgId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  role: MembershipRole;
  status: MembershipStatus;
  disabledReason?: MembershipDisabledReason;
  invitedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const MembershipSchema = new Schema<IMembership>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'Users', required: true, index: true },
    role: {
      type: String,
      enum: ['owner', 'admin', 'auditor', 'user'],
      default: 'user',
      index: true,
    },
    status: {
      type: String,
      enum: ['active', 'invited', 'disabled'],
      default: 'active',
      index: true,
    },
    disabledReason: {
      type: String,
      enum: ['user_deleted', 'admin', 'billing', 'other'],
      default: null,
    },
    invitedBy: { type: Schema.Types.ObjectId, ref: 'Users' },
  },
  { timestamps: true }
);

MembershipSchema.index({ orgId: 1, userId: 1 }, { unique: true });

export default mongoose.models.Membership ||
  mongoose.model<IMembership>('Membership', MembershipSchema);
