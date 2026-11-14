import mongoose, { Document, Schema } from 'mongoose';
import type { OrganizationSettings } from '@/lib/org-settings';
import type { OrganizationPlanCode } from '@/lib/subscription-plans';
import type { BillingCycle, BillingMarket, BillingProvider, OrganizationBillingState } from '@/lib/billing';

export type OrganizationPlan = OrganizationPlanCode;
export type OrganizationStatus = 'active' | 'past_due' | 'suspended';

export interface IOrganization extends Document {
  name: string;
  slug?: string;
  ownerUserId: mongoose.Types.ObjectId;
  plan: OrganizationPlan;
  status: OrganizationStatus;
  seatLimit: number;
  trialEndsAt?: Date;
  trialExpirationEmailSentAt?: Date | null;
  trialExpirationEmailLastAttemptAt?: Date | null;
  trialExpirationEmailClaimedAt?: Date | null;
  trialExpirationEmailClaimId?: string | null;
  billing?: OrganizationBillingState;
  settings?: OrganizationSettings;
  createdAt: Date;
  updatedAt: Date;
}

const OrganizationBillingSchema = new Schema(
  {
    provider: {
      type: String,
      enum: ['razorpay', 'paypal'] satisfies BillingProvider[],
      default: 'razorpay',
    },
    market: {
      type: String,
      enum: ['india', 'international'] satisfies BillingMarket[],
      default: null,
    },
    customerId: { type: String, trim: true, default: '' },
    subscriptionId: { type: String, trim: true, default: '' },
    subscriptionStatus: { type: String, trim: true, default: '' },
    targetPlan: {
      type: String,
      enum: ['business', 'business_plus', 'enterprise'],
      default: null,
    },
    planId: { type: String, trim: true, default: '' },
    billingCycle: {
      type: String,
      enum: ['monthly', 'annually'] satisfies BillingCycle[],
      default: null,
    },
    currencyCode: { type: String, trim: true, uppercase: true, default: '' },
    vaultId: { type: String, trim: true, default: '' },
    vaultStatus: { type: String, trim: true, default: '' },
    paymentMethodType: {
      type: String,
      enum: ['paypal', 'card'],
      default: null,
    },
    paymentMethodBrand: { type: String, trim: true, default: '' },
    paymentMethodLast4: { type: String, trim: true, default: '' },
    currentPeriodStart: { type: Date, default: null },
    currentPeriodEnd: { type: Date, default: null },
    cancelAtPeriodEnd: { type: Boolean, default: false },
    hasScheduledChange: { type: Boolean, default: false },
    lastCheckoutReference: { type: String, trim: true, default: '' },
    lastPaymentId: { type: String, trim: true, default: '' },
    lastWebhookEventId: { type: String, trim: true, default: '' },
    updatedAt: { type: Date, default: null },
  },
  { _id: false }
);

const OrganizationBrandingSettingsSchema = new Schema(
  {
    brandName: { type: String, trim: true, default: '' },
    primaryColor: { type: String, trim: true, default: '#2563eb' },
    supportEmail: { type: String, trim: true, lowercase: true, default: '' },
  },
  { _id: false }
);

const OrganizationDocumentDefaultsSchema = new Schema(
  {
    defaultSigningMode: {
      type: String,
      enum: ['parallel', 'sequential'],
      default: 'parallel',
    },
    defaultExpirationDays: { type: Number, default: 14 },
    autoReminders: { type: Boolean, default: true },
    reminderIntervalDays: { type: Number, default: 3 },
  },
  { _id: false }
);

const OrganizationNotificationRulesSchema = new Schema(
  {
    emailDigest: {
      type: String,
      enum: ['immediate', 'daily', 'weekly', 'off'],
      default: 'immediate',
    },
    notifyOnViewed: { type: Boolean, default: true },
    notifyOnSigned: { type: Boolean, default: true },
    notifyOnCompleted: { type: Boolean, default: true },
    notifyOnDeclined: { type: Boolean, default: true },
    inviteSubject: {
      type: String,
      trim: true,
      default: 'Document Name: Signature Request from Sender name',
    },
    inviteMessage: {
      type: String,
      trim: true,
      default: 'Sender name invited you to sign Document Name',
    },
  },
  { _id: false }
);

const OrganizationDefaultRetentionSchema = new Schema(
  {
    enabled: { type: Boolean, default: false },
    triggerEvent: {
      type: String,
      enum: ['createdAt', 'completedAt', 'finalizedAt', 'expiresAt', 'custom'],
      default: 'completedAt',
    },
    durationDays: { type: Number, default: 365 * 7 },
    regime: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const OrganizationSettingsSchema = new Schema(
  {
    branding: { type: OrganizationBrandingSettingsSchema, default: () => ({}) },
    documentDefaults: { type: OrganizationDocumentDefaultsSchema, default: () => ({}) },
    notificationRules: { type: OrganizationNotificationRulesSchema, default: () => ({}) },
    defaultRetention: { type: OrganizationDefaultRetentionSchema, default: () => ({}) },
  },
  { _id: false }
);

const OrganizationSchema = new Schema<IOrganization>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, trim: true, unique: true, sparse: true },
    ownerUserId: { type: Schema.Types.ObjectId, ref: 'Users', required: true, index: true },
    plan: {
      type: String,
      enum: ['free', 'trial', 'pro', 'business', 'business_plus', 'enterprise'],
      default: 'trial',
      index: true,
    },
    status: {
      type: String,
      enum: ['active', 'past_due', 'suspended'],
      default: 'active',
      index: true,
    },
    seatLimit: { type: Number, default: 5 },
    trialEndsAt: { type: Date },
    trialExpirationEmailSentAt: { type: Date, default: null },
    trialExpirationEmailLastAttemptAt: { type: Date, default: null },
    trialExpirationEmailClaimedAt: { type: Date, default: null },
    trialExpirationEmailClaimId: { type: String, default: null },
    billing: { type: OrganizationBillingSchema, default: undefined },
    settings: { type: OrganizationSettingsSchema, default: () => ({}) },
  },
  { timestamps: true }
);

OrganizationSchema.index({ plan: 1, trialEndsAt: 1 });

export default mongoose.models.Organization ||
  mongoose.model<IOrganization>('Organization', OrganizationSchema);
