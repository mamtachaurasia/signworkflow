import mongoose, { Document } from 'mongoose';

export type UserRole = 'user' | 'admin' | 'owner' | 'auditor';

export interface ISignatureItem {
  id: string;
  type: 'typed' | 'drawn';
  value: string;
  isDefault: boolean;
}

export interface IAddress {
  country?: string;
  street?: string;
  apartment?: string;
  city?: string;
  state?: string;
  zip?: string;
}

export interface IUser extends Document {
  email: string;
  passwordHash?: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  picture?: string;
  phone?: string;
  address?: IAddress;
  role: UserRole;
  primaryOrgId?: mongoose.Types.ObjectId | null;
  isActive: boolean;
  isDeleted: boolean;
  deletedAt?: Date | null;
  deletionScheduledAt?: Date | null;
  purgedAt?: Date | null;
  tokenVersion: number;
  mfaEnabled: boolean;
  mfaSecret?: string | null;
  failedLoginAttempts: number;
  lockUntil?: Date | null;
  pendingAccount?: boolean;
  pendingInvite?: {
    source?: 'document_share' | 'workspace';
    invitedBy?: mongoose.Types.ObjectId | string;
    documentId?: mongoose.Types.ObjectId | string;
    access?: 'can_view' | 'can_send' | 'can_edit' | string;
    invitedAt?: Date | null;
    claimedAt?: Date | null;
  };
  settings?: {
    twoFactor?: boolean;
    displayEsignId?: boolean;
    dateFormat?: string;
    inviteSubject?: string;
    inviteMessage?: string;
  };
  passwordResetToken?: {
    token?: string | null;
    expires?: Date | null;
  };
  initials: ISignatureItem[];
  signatures: ISignatureItem[];
  stamps: ISignatureItem[];
  createdAt: Date;
  updatedAt: Date;
}

const SignatureItemSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    type: { type: String, enum: ['typed', 'drawn'], required: true },
    value: { type: String, required: true },
    isDefault: { type: Boolean, default: false },
  },
  { _id: false }
);

const AddressSchema = new mongoose.Schema(
  {
    country: { type: String },
    street: { type: String },
    apartment: { type: String },
    city: { type: String },
    state: { type: String },
    zip: { type: String },
  },
  { _id: false }
);

const PendingInviteSchema = new mongoose.Schema(
  {
    source: { type: String, enum: ['document_share', 'workspace'], default: 'document_share' },
    invitedBy: { type: mongoose.Schema.Types.Mixed, default: null },
    documentId: { type: mongoose.Schema.Types.Mixed, default: null },
    access: { type: String, default: null },
    invitedAt: { type: Date, default: null },
    claimedAt: { type: Date, default: null },
  },
  { _id: false }
);

const UserSchema = new mongoose.Schema<IUser>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
      lowercase: true,
    },
    passwordHash: { type: String, required: false, select: false },
    // Legacy field retained for backward compatibility with existing flows.
    password: { type: String, required: false, select: false },
    firstName: { type: String, required: false },
    lastName: { type: String, required: false },
    name: { type: String, required: false },
    picture: { type: String, required: false },
    phone: { type: String, required: false },
    address: { type: AddressSchema, required: false },
    role: {
      type: String,
      enum: ['user', 'admin', 'owner', 'auditor'],
      default: 'user',
      index: true,
    },
    primaryOrgId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null, index: true },
    isActive: { type: Boolean, default: true, index: true },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null, index: true },
    deletionScheduledAt: { type: Date, default: null, index: true },
    purgedAt: { type: Date, default: null, index: true },
    tokenVersion: { type: Number, default: 0 },
    mfaEnabled: { type: Boolean, default: false },
    mfaSecret: { type: String, default: null, select: false },
    failedLoginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null },
    pendingAccount: { type: Boolean, default: false, index: true },
    pendingInvite: { type: PendingInviteSchema, default: undefined },
    settings: { type: mongoose.Schema.Types.Mixed, default: {} },
    passwordResetToken: {
      token: { type: String },
      expires: { type: Date },
    },
    initials: {
      type: [SignatureItemSchema],
      default: [],
    },
    signatures: {
      type: [SignatureItemSchema],
      default: [],
    },
    stamps: {
      type: [SignatureItemSchema],
      default: [],
    },
  },
  {
    timestamps: true,
    minimize: false,
  }
);

UserSchema.pre('save', function normalizeEmail(next) {
  if (this.email) {
    this.email = this.email.trim().toLowerCase();
  }
  next();
});

const UserModel =
  (mongoose.models.Users as mongoose.Model<IUser>) || mongoose.model<IUser>('Users', UserSchema);

export default UserModel;
