import mongoose, { Schema } from 'mongoose';
import { DocumentField, IDocument as BaseIDocument, Recipient, IEditHistory } from '@/types/types';
import type { DocumentShareAccess } from '@/lib/document-sharing';
import type { EditableTemplateContent } from '@/types/template-content';
import { hashSigningToken } from '@/lib/signing-token';

// The base IDocument from @/types/types is missing properties defined in the schema below.
// We extend it here to create a complete interface for our Document model, resolving the type error.
export interface IAIInsight {
  _id?: mongoose.Types.ObjectId;
  type: 'summary' | 'translation' | 'explanation' | 'risk_analysis';
  language?: string;
  content: string;
  selectedText?: string;
  selectionMeta?: {
    pageNumber?: number;
    startOffset?: number;
    endOffset?: number;
  };
  metadata?: {
    processingTime?: number;
    provider?: string;
    model?: string;
    tokenUsage?: {
      input: number;
      output: number;
    };
  };
  createdAt: Date;
  savedBy: string;
}

export interface IAIMetadata {
  lastAnalyzedAt?: Date;
  analysisCount?: number;
}

export interface IDocumentTemplatePreparation {
  completed: boolean;
  variableValues?: Record<string, string>;
  excludedVariableKeys?: string[];
  completedAt?: Date;
  fieldsNeedReview?: boolean;
}

export interface IDocumentSendDispatch {
  claimId: string;
  status: 'processing' | 'completed' | 'failed';
  claimedAt: Date;
  completedAt?: Date;
  failedAt?: Date;
  subject?: string;
  message?: string;
  deliveries?: ISigningEmailDelivery[];
}

export interface ISigningEmailDelivery {
  recipientId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'dead_letter' | 'cancelled';
  tokenEncrypted?: string;
  attempts: number;
  nextAttemptAt?: Date;
  claimId?: string;
  claimedAt?: Date;
  completedAt?: Date;
  lastError?: string;
}

export interface IDocument extends Omit<BaseIDocument, 'orgId' | 'teamId' | 'retention' | 'legalHold' | 'versions'> {
  integrationOutbox?: Record<string, unknown>;
  integrationNextAttemptAt?: Date;
  integrationLastError?: string;
  templateId?: mongoose.Schema.Types.ObjectId;
  editableContent?: EditableTemplateContent;
  templatePreparation?: IDocumentTemplatePreparation;
  sendDispatch?: IDocumentSendDispatch;
  orgId?: mongoose.Schema.Types.ObjectId;
  teamId?: mongoose.Schema.Types.ObjectId | null;
  deletedAt?: Date;
  statusBeforeDelete?: string;
  signingMode?: 'parallel' | 'sequential';
  signingEvents?: ISigningEventAttributes[];
  auditTrailVersion?: number;
  completedAt?: Date;
  finalizedAt?: Date;
  derivedFromDocumentId?: mongoose.Schema.Types.ObjectId;
  derivedFromVersion?: number;
  versions?: IVersionDoc[];
  retention?: IDocumentRetention;
  legalHold?: IDocumentLegalHold;
  paymentRequest?: IDocumentPaymentRequest;
  sharedWith?: IDocumentShare[];
  aiInsights?: IAIInsight[];
  aiMetadata?: IAIMetadata;
}

export interface IDocumentShare {
  email: string;
  name?: string;
  contactId?: mongoose.Schema.Types.ObjectId;
  access: DocumentShareAccess;
  sharedBy: string;
  recipientUserId?: string;
  accountStatus?: 'registered' | 'pending' | 'guest';
  sharedAt: Date;
  updatedAt?: Date;
  lastNotificationAt?: Date;
  accountClaimSentAt?: Date;
  shareTokenHash?: string;
  revokedAt?: Date | null;
}

export interface IDocumentRecipient extends Recipient {
  sendReminders: boolean;
  reminderDays?: number; // optional if reminders are off
  expiresAt?: Date | null;
  signingTokenHash?: string;

  // Timestamps for actions
  signedAt?: Date | null;
  signedVersion?: number | null;
  approvedAt?: Date | null;   // track approver approval time
  rejectedAt?: Date | null;   // track rejection time
  viewedAt?: Date | null;     // track when the document was viewed

  // Additional metadata
  token?: string;      // unique token URL for signing
  color: string;      // UI color per recipient (optional)
  isCC?: boolean;      // marks CC recipients
  order: number;      // signing order (optional for viewers)

  // --- Location ---
  location?: {
    latitude?: number;
    longitude?: number;
    accuracyMeters?: number;
    city?: string;
    state?: string;
    country?: string;
    capturedAt?: Date;
  };

  // --- Device info ---
  device?: {
    type?: 'mobile' | 'desktop' | 'tablet';
    os?: string;
    browser?: string;
    userAgent?: string;
  };

  // --- Network context ---
  network?: {
    ip?: string;
    ipUnavailableReason?: string;
    isp?: string;
    ipLocation?: {
      city?: string;
      country?: string;
    };
  };

  // --- Consent (CRITICAL) ---
  consent?: {
    locationGranted?: boolean;
    grantedAt?: Date;
    method?: 'system_prompt' | 'checkbox' | 'other';
    esignDisclosureAccepted?: boolean;
    esignDisclosureAcceptedAt?: Date;
    esignDisclosureVersion?: string;
    esignDisclosureMethod?: 'checkbox' | 'typed' | 'other';
  };

  // --- Identity verification ---
  identityVerification?: {
    method?: 'email' | 'sms' | 'kba' | 'id_document' | 'bank_id' | 'selfie' | 'manual' | 'none';
    provider?: string;
    result?: 'passed' | 'failed' | 'skipped';
    verifiedAt?: Date;
    transactionId?: string;
    payloadHash?: string;
  };

  // --- Authentication context ---
  authentication?: {
    method?: 'email' | 'sms' | 'otp' | 'sso' | 'none';
    channel?: string;
    verifiedAt?: Date;
    transactionId?: string;
  };
}

export type RetentionTriggerEvent =
  | 'createdAt'
  | 'completedAt'
  | 'finalizedAt'
  | 'expiresAt'
  | 'custom';

export interface IDocumentRetentionPolicySnapshot {
  policyId?: mongoose.Types.ObjectId | string;
  name?: string;
  docType?: string;
  jurisdiction?: string;
  triggerEvent?: RetentionTriggerEvent;
  durationDays?: number;
  regime?: string;
  priority?: number;
}

export interface IDocumentRetention {
  docType?: string;
  jurisdiction?: string;
  governingLaw?: string;
  customTriggerAt?: Date;
  policySelection?: 'automatic' | 'manual';
  policyOverrideId?: mongoose.Types.ObjectId | string;
  policy?: IDocumentRetentionPolicySnapshot;
  triggerEvent?: RetentionTriggerEvent;
  triggerAt?: Date;
  startAt?: Date;
  endAt?: Date;
  status?: 'unclassified' | 'pending_trigger' | 'active' | 'eligible' | 'on_hold';
  lastEvaluatedAt?: Date;
}

export interface IDocumentLegalHold {
  status: 'none' | 'active' | 'unknown';
  holdIds: mongoose.Schema.Types.ObjectId[];
  lastCheckedAt?: Date;
}

export interface IDocumentPaymentRequest {
  enabled: boolean;
  provider: 'external_link';
  amount?: number;
  currency?: string;
  description?: string;
  paymentLinkUrl?: string;
  status?: 'pending' | 'paid';
  requestedAt?: Date;
  paidAt?: Date | null;
}

const PageRectSchema = new Schema(
  {
    x: { type: Number },
    y: { type: Number },
    width: { type: Number },
    height: { type: Number },
    top: { type: Number },
    right: { type: Number },
    bottom: { type: Number },
    left: { type: Number },
  },
  { _id: false }
);

const DocumentFieldSchema = new Schema<DocumentField>({
  id: { type: String, required: true },
  repeatGroupId: { type: String },
  repeatSourceId: { type: String },
  type: { type: String, required: true, enum: ['signature', 'text', 'full_name', 'date', 'checkbox', 'radio', 'dropdown', 'image', 'initials', 'live_photo', 'stamp'] },
  x: { type: Number, required: true },
  y: { type: Number, required: true },
  width: { type: Number, required: true },
  height: { type: Number, required: true },
  pageNumber: { type: Number, required: true },
  pageRect: { type: PageRectSchema },
  recipientId: { type: String },
  required: { type: Boolean, default: true },
  value: { type: String, default: null },
  placeholder: { type: String },
  settings: { type: Schema.Types.Mixed, default: undefined },
  mimeType: { type: String },
  fieldOwner: { type: String, default: 'recipient' },
});

const DocumentRecipientSchema = new Schema<IDocumentRecipient>({
  id: { type: String, required: true },
  // Draft agreements may retain an unassigned reusable template role. The
  // send-for-signing contract still requires and validates a real email.
  email: { type: String, default: '' },
  name: { type: String, required: true },
  role: { type: String, required: true, enum: ['signer', 'approver', 'viewer'] },
  captureGpsLocation: { type: Boolean, default: false },
  order: { type: Number },
  isCC: { type: Boolean, default: false },
  color: {
    type: String, default: function (): string {
      switch (this.role) {
        case 'signer': return '#3B82F6';
        case 'approver': return '#10B981';
        case 'viewer': return '#6B7280';
        default: return '#6B7280';
      }
    }
  },
  signingToken: { type: String },
  signingTokenHash: { type: String },
  viewedAt: { type: Date },
  status: { type: String, default: 'pending', enum: ['pending', 'sent', 'viewed', 'signed', 'approved', 'rejected', 'delivery_failed', 'expired'] },
  signedAt: { type: Date },
  signedVersion: { type: Number },
  approvedAt: { type: Date },
  rejectedAt: { type: Date },
  sendReminders: { type: Boolean, default: false },
  reminderDays: { type: Number },
  expiresAt: { type: Date },
  location: {
    latitude: { type: Number },
    longitude: { type: Number },
    accuracyMeters: { type: Number },
    city: { type: String },
    state: { type: String },
    country: { type: String },
    capturedAt: { type: Date },
  },
  device: {
    type: { type: String, enum: ['mobile', 'desktop', 'tablet'] },
    os: { type: String },
    browser: { type: String },
    userAgent: { type: String },
  },
  network: {
    ip: { type: String },
    ipUnavailableReason: { type: String },
    isp: { type: String },
    ipLocation: {
      city: { type: String },
      country: { type: String },
    },
  },
  consent: {
    locationGranted: { type: Boolean },
    grantedAt: { type: Date },
    method: { type: String, enum: ['system_prompt', 'checkbox', 'other'] },
    esignDisclosureAccepted: { type: Boolean },
    esignDisclosureAcceptedAt: { type: Date },
    esignDisclosureVersion: { type: String },
    esignDisclosureMethod: { type: String, enum: ['checkbox', 'typed', 'other'] },
  },
  identityVerification: {
    method: { type: String, enum: ['email', 'sms', 'kba', 'id_document', 'bank_id', 'selfie', 'manual', 'none'] },
    provider: { type: String },
    result: { type: String, enum: ['passed', 'failed', 'skipped'] },
    verifiedAt: { type: Date },
    transactionId: { type: String },
    payloadHash: { type: String },
  },
  authentication: {
    method: { type: String, enum: ['email', 'sms', 'otp', 'sso', 'none'] },
    channel: { type: String },
    verifiedAt: { type: Date },
    transactionId: { type: String },
  },
});

const EditHistorySchema = new Schema<IEditHistory>({
  sessionId: { type: String, required: true },
  fields: [DocumentFieldSchema],
  documentName: { type: String },
  timestamp: { type: Date, default: Date.now },
  changeLog: { type: String, required: true },
});

// Storage reference for object storage (S3, GCS, Azure, etc.)
const StorageRefSchema = new Schema({
  provider: { type: String, enum: ['s3', 'gcs', 'azure', 'cloudinary', 'r2', 'local-dev'], required: true },
  bucket: { type: String, required: function (this: { provider: string }) { return ['s3', 'gcs', 'azure', 'r2', 'local-dev'].includes(this.provider); } },
  region: { type: String },
  key: { type: String, required: function (this: { provider: string }) { return ['s3', 'gcs', 'azure', 'r2', 'local-dev'].includes(this.provider); } }, // object name/key/path
  url: { type: String }, // optional immutable URL or URI (e.g., s3://bucket/key)
  versionId: { type: String }, // optional for object versioning/WORM
}, { _id: false });



export interface IVersionDoc extends mongoose.Types.Subdocument {
  version: number;
  label: string;
  signedBy?: string[];
  renderedBy?: string;
  pdfSignedAt?: Date;
  changeMeta?: {
    action?: string;
    actorId?: string;
    actorRole?: string;
    signingMode?: string;
    baseVersion?: number;
    derivedFromVersion?: number;
    signedAt?: Date;
    source?: 'client' | 'server' | 'system';
  };
  storage: {
    provider: string;
    bucket?: string;
    region?: string;
    key?: string;
    url?: string;
    versionId?: string;
  };
  hash: string;
  hashAlgo?: string;
  size: number;
  mimeType: string;
  locked: boolean;
  derivedFromVersion?: number;
  sentAt?: Date;
  expiresAt?: Date;
  fields?: DocumentField[];
  documentName?: string;
  status: 'draft' | 'locked' | 'final';
  changeLog?: string;
  ingestionNote?: string;
  editHistory?: IEditHistory[];
  createdAt: Date;
  updatedAt: Date;
}

export const DocumentVersionSchema = new Schema<IVersionDoc>({
  version: { type: Number, required: true },
  label: { type: String, required: true },
  signedBy: { type: [String], default: undefined },
  renderedBy: { type: String },
  pdfSignedAt: { type: Date },
  changeMeta: {
    action: { type: String },
    actorId: { type: String },
    actorRole: { type: String },
    signingMode: { type: String },
    baseVersion: { type: Number },
    derivedFromVersion: { type: Number },
    signedAt: { type: Date },
    source: { type: String, enum: ['client', 'server', 'system'] },
  },
  storage: { type: StorageRefSchema, required: true },
  hash: { type: String, required: true },
  hashAlgo: { type: String, default: 'SHA-256' },
  size: { type: Number, required: true },
  mimeType: { type: String, required: true, default: 'application/pdf' },
  locked: { type: Boolean, required: true, default: false },
  derivedFromVersion: { type: Number },
  sentAt: { type: Date },
  expiresAt: { type: Date },
  fields: { type: [DocumentFieldSchema], default: undefined },
  documentName: { type: String },
  changeLog: { type: String },
  ingestionNote: { type: String },
  editHistory: { type: [EditHistorySchema], default: undefined },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Signing State
export interface ISigningEventAttributes {
  recipientId: string;
  action?: 'sent' | 'viewed' | 'signed' | 'approved' | 'rejected' | 'voided' | 'consent_accepted';
  fields?: Array<{ fieldId: string; fieldHash: string }>;
  fieldsHash?: string;
  fieldsHashAlgo?: string;
  signatureHash?: string;
  signatureHashAlgo?: string;
  signedAt?: Date;
  sentAt?: Date;
  serverTimestamp?: Date;
  baseVersion?: number;
  targetVersion?: number;
  ip?: string;
  ipUnavailableReason?: string;
  userAgent?: string;
  order?: number;
  version?: number;
  client?: {
    ip?: string;
    userAgent?: string;
    deviceType?: 'mobile' | 'desktop' | 'tablet';
    os?: string;
    browser?: string;
  };
  geo?: {
    latitude?: number;
    longitude?: number;
    accuracyMeters?: number;
    city?: string;
    state?: string;
    country?: string;
    capturedAt?: Date;
    source?: string;
  };
  consent?: {
    locationGranted?: boolean;
    grantedAt?: Date;
    method?: 'system_prompt' | 'checkbox' | 'other';
    esignDisclosureAccepted?: boolean;
    esignDisclosureAcceptedAt?: Date;
    esignDisclosureVersion?: string;
    esignDisclosureMethod?: 'checkbox' | 'typed' | 'other';
  };
}

export interface ISigningEvent extends mongoose.Types.Subdocument, ISigningEventAttributes {}

const SigningEventSchema = new Schema<ISigningEvent>({
  recipientId: { type: String, required: true },
  action: { type: String, enum: ['sent', 'viewed', 'signed', 'approved', 'rejected', 'voided', 'consent_accepted'] },
  fields: {
    type: [
      {
        fieldId: { type: String, required: true },
        fieldHash: { type: String, required: true },
      }
    ],
    default: undefined
  },
  fieldsHash: { type: String },
  fieldsHashAlgo: { type: String, default: 'SHA-256' },
  signatureHash: { type: String },
  signatureHashAlgo: { type: String, default: 'SHA-256' },
  signedAt: { type: Date },
  sentAt: { type: Date },
  serverTimestamp: { type: Date },
  baseVersion: { type: Number },
  targetVersion: { type: Number },
  ip: { type: String },
  ipUnavailableReason: { type: String },
  userAgent: { type: String },
  order: { type: Number },
  version: { type: Number },
  client: {
    ip: { type: String },
    userAgent: { type: String },
    deviceType: { type: String, enum: ['mobile', 'desktop', 'tablet'] },
    os: { type: String },
    browser: { type: String },
  },
  geo: {
    latitude: { type: Number },
    longitude: { type: Number },
    accuracyMeters: { type: Number },
    city: { type: String },
    state: { type: String },
    country: { type: String },
    capturedAt: { type: Date },
    source: { type: String },
  },
  consent: {
    locationGranted: { type: Boolean },
    grantedAt: { type: Date },
    method: { type: String, enum: ['system_prompt', 'checkbox', 'other'] },
    esignDisclosureAccepted: { type: Boolean },
    esignDisclosureAcceptedAt: { type: Date },
    esignDisclosureVersion: { type: String },
    esignDisclosureMethod: { type: String, enum: ['checkbox', 'typed', 'other'] },
  },
}, { _id: false });

const RetentionPolicySnapshotSchema = new Schema<IDocumentRetentionPolicySnapshot>(
  {
    policyId: { type: Schema.Types.ObjectId, ref: 'RetentionPolicy' },
    name: { type: String },
    docType: { type: String },
    jurisdiction: { type: String },
    triggerEvent: { type: String, enum: ['createdAt', 'completedAt', 'finalizedAt', 'expiresAt', 'custom'] },
    durationDays: { type: Number },
    regime: { type: String },
    priority: { type: Number },
  },
  { _id: false }
);

const DocumentRetentionSchema = new Schema<IDocumentRetention>(
  {
    docType: { type: String },
    jurisdiction: { type: String },
    governingLaw: { type: String },
    customTriggerAt: { type: Date },
    policySelection: { type: String, enum: ['automatic', 'manual'] },
    policyOverrideId: { type: Schema.Types.ObjectId, ref: 'RetentionPolicy' },
    policy: { type: RetentionPolicySnapshotSchema, default: undefined },
    triggerEvent: { type: String, enum: ['createdAt', 'completedAt', 'finalizedAt', 'expiresAt', 'custom'] },
    triggerAt: { type: Date },
    startAt: { type: Date },
    endAt: { type: Date },
    status: {
      type: String,
      enum: ['unclassified', 'pending_trigger', 'active', 'eligible', 'on_hold'],
      default: 'unclassified',
    },
    lastEvaluatedAt: { type: Date },
  },
  { _id: false }
);

const DocumentLegalHoldSchema = new Schema<IDocumentLegalHold>(
  {
    status: { type: String, enum: ['none', 'active', 'unknown'], default: 'none' },
    holdIds: { type: [Schema.Types.ObjectId], ref: 'LegalHold', default: [] },
    lastCheckedAt: { type: Date },
  },
  { _id: false }
);

const DocumentTemplatePreparationSchema = new Schema<IDocumentTemplatePreparation>(
  {
    completed: { type: Boolean, default: false },
    variableValues: { type: Schema.Types.Mixed, default: undefined },
    excludedVariableKeys: { type: [String], default: undefined },
    completedAt: { type: Date, default: undefined },
    fieldsNeedReview: { type: Boolean, default: false },
  },
  { _id: false }
);

const SigningEmailDeliverySchema = new Schema<ISigningEmailDelivery>({
  recipientId: { type: String, required: true },
  status: { type: String, enum: ['queued', 'processing', 'completed', 'failed', 'dead_letter', 'cancelled'], required: true },
  tokenEncrypted: { type: String, select: false },
  attempts: { type: Number, required: true, default: 0 },
  nextAttemptAt: { type: Date },
  claimId: { type: String },
  claimedAt: { type: Date },
  completedAt: { type: Date },
  lastError: { type: String },
}, { _id: false });

const DocumentSendDispatchSchema = new Schema<IDocumentSendDispatch>(
  {
    claimId: { type: String, required: true },
    status: { type: String, enum: ['processing', 'completed', 'failed'], required: true },
    claimedAt: { type: Date, required: true },
    completedAt: { type: Date },
    failedAt: { type: Date },
    subject: { type: String },
    message: { type: String },
    deliveries: { type: [SigningEmailDeliverySchema], default: undefined },
  },
  { _id: false }
);

const DocumentPaymentRequestSchema = new Schema<IDocumentPaymentRequest>(
  {
    enabled: { type: Boolean, default: false },
    provider: { type: String, enum: ['external_link'], default: 'external_link' },
    amount: { type: Number },
    currency: { type: String, trim: true, uppercase: true, default: 'INR' },
    description: { type: String, trim: true, default: '' },
    paymentLinkUrl: { type: String, trim: true, default: '' },
    status: { type: String, enum: ['pending', 'paid'], default: 'pending' },
    requestedAt: { type: Date },
    paidAt: { type: Date, default: null },
  },
  { _id: false }
);

const DocumentShareSchema = new Schema<IDocumentShare>(
  {
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 320 },
    name: { type: String, trim: true, maxlength: 200 },
    contactId: { type: Schema.Types.ObjectId, ref: 'Contact' },
    access: {
      type: String,
      enum: ['can_view', 'can_send', 'can_edit'],
      required: true,
      default: 'can_view',
    },
    sharedBy: { type: String, required: true },
    recipientUserId: { type: String },
    accountStatus: {
      type: String,
      enum: ['registered', 'pending', 'guest'],
      default: 'guest',
    },
    sharedAt: { type: Date, default: Date.now },
    updatedAt: { type: Date },
    lastNotificationAt: { type: Date },
    accountClaimSentAt: { type: Date },
    shareTokenHash: { type: String },
    revokedAt: { type: Date, default: undefined },
  },
  { _id: false }
);

const AIInsightSchema = new Schema<IAIInsight>(
  {
    type: {
      type: String,
      enum: ['summary', 'translation', 'explanation', 'risk_analysis'],
      required: true,
    },
    language: { type: String },
    content: { type: String, required: true },
    selectedText: { type: String },
    selectionMeta: {
      pageNumber: { type: Number },
      startOffset: { type: Number },
      endOffset: { type: Number },
    },
    metadata: {
      processingTime: { type: Number },
      provider: { type: String },
      model: { type: String },
      tokenUsage: {
        input: { type: Number },
        output: { type: Number },
      },
    },
    createdAt: { type: Date, default: Date.now },
    savedBy: { type: String, required: true },
  },
  { _id: true }
);


const DocumentSchema = new Schema<IDocument>({
  orgId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', index: true },
  teamId: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', index: true, default: null },
  userId: { type: String, required: true },
  documentName: { type: String, required: true },
  originalFileName: { type: String, required: true },
  currentVersion: { type: Number, default: 0 },
  currentSessionId: { type: String },
  signingMode: { type: String, enum: ['parallel', 'sequential'], default: 'parallel' },
  versions: { type: [DocumentVersionSchema], default: [] },
  recipients: { type: [DocumentRecipientSchema], default: [] },
  signingEvents: { type: [SigningEventSchema], default: [] },
  auditTrailVersion: { type: Number, default: 1 },
  completedAt: { type: Date },
  finalizedAt: { type: Date },
  derivedFromDocumentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document' },
  derivedFromVersion: { type: Number },
  status: {
    type: String,
    default: 'draft',
    enum: [
      'draft', 'sent', 'signed', 'expired', 'final', 'rejected', 'pending',
      'completed', 'in_progress', 'cancelled', 'voided', 'delivery_failed', 'trashed'
    ]
  },
  deletedAt: { type: Date, default: null },
  statusBeforeDelete: { type: String },
  templateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Template', sparse: true, required: false },
  editableContent: { type: Schema.Types.Mixed, default: undefined },
  templatePreparation: { type: DocumentTemplatePreparationSchema, default: undefined },
  sendDispatch: { type: DocumentSendDispatchSchema, default: undefined },
  token: { type: String, sparse: true, unique: true },
  isTemplate: { type: Boolean, default: false },
  usageCount: { type: Number, default: 0 },
  retention: { type: DocumentRetentionSchema, default: undefined },
  legalHold: { type: DocumentLegalHoldSchema, default: undefined },
  paymentRequest: { type: DocumentPaymentRequestSchema, default: undefined },
  sharedWith: { type: [DocumentShareSchema], default: [] },
  aiInsights: { type: [AIInsightSchema], default: [], select: false },
  integrationOutbox: { type: Schema.Types.Mixed, select: false },
  integrationNextAttemptAt: { type: Date, select: false, index: true },
  integrationLastError: { type: String, select: false },
  aiMetadata: {
    lastAnalyzedAt: { type: Date },
    analysisCount: { type: Number, default: 0 },
  },
}, { timestamps: true });

DocumentSchema.pre('validate', function normalizeSigningTokens(next) {
  if (Array.isArray(this.recipients)) {
    for (const recipient of this.recipients as IDocumentRecipient[]) {
      const legacySigningToken =
        typeof recipient?.signingToken === 'string' ? recipient.signingToken.trim() : '';

      if (!recipient.signingTokenHash && legacySigningToken) {
        recipient.signingTokenHash = hashSigningToken(legacySigningToken);
      }

      if (legacySigningToken) {
        recipient.signingToken = undefined;
      }
    }
  }

  next();
});

// Indexes for performance
DocumentSchema.index({ orgId: 1, userId: 1, createdAt: -1 });
DocumentSchema.index({ orgId: 1, teamId: 1, createdAt: -1 });
DocumentSchema.index({ 'sharedWith.email': 1, updatedAt: -1 });
DocumentSchema.index({ 'retention.endAt': 1, 'legalHold.status': 1 });
DocumentSchema.index({ 'aiInsights.createdAt': 1 });
DocumentSchema.index({ 'sendDispatch.deliveries.status': 1, 'sendDispatch.deliveries.nextAttemptAt': 1 });
DocumentSchema.index({ 'sendDispatch.deliveries.status': 1, 'sendDispatch.deliveries.claimedAt': 1 });
DocumentVersionSchema.index({ label: 1, version: 1 });

export default mongoose.models.Document || mongoose.model<IDocument>('Document', DocumentSchema);
