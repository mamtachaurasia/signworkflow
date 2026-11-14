import type { FieldOwner, FieldPropertySettings, PageRect } from './fields';
import type { Recipient } from './recipients';
import type { EditableTemplateContent } from './template-content';

export type DocumentShareAccess = 'can_view' | 'can_send' | 'can_edit';

export interface DocumentShare {
  email: string;
  name?: string;
  contactId?: string;
  access: DocumentShareAccess;
  sharedBy?: string;
  recipientUserId?: string;
  accountStatus?: 'registered' | 'pending' | 'guest';
  sharedAt?: Date | string;
  updatedAt?: Date | string;
  lastNotificationAt?: Date | string;
  accountClaimSentAt?: Date | string;
  revokedAt?: Date | string | null;
}

export interface Doc {
  [x: string]: unknown;
  id: string;
  name: string;
  createdAt: Date;
  updatedAt?: Date | string;
  currentVersion?: number;
  status:
    | 'draft'
    | 'saved'
    | 'sent'
    | 'viewed'
    | 'in_progress'
    | 'signed'
    | 'approved'
    | 'completed'
    | 'rejected'
    | 'delivery_failed'
    | 'expired'
    | 'cancelled'
    | 'voided'
    | 'pending'
    | 'trashed';
  deletedAt?: Date | null;
  statusBeforeDelete?: Doc['status'];
  userId?: string;
  ownerId?: string;
  signers?: string[];
  file?: File | string;
  fileUrl?: string;
  url?: string;
  documentId?: string;
  isTemplate?: boolean;
  hasEditableContent?: boolean;
  teamId?: string | null;
  teamName?: string | null;
  sharedWith?: DocumentShare[];
  shareAccess?: DocumentShareAccess | null;
  paymentRequest?: {
    enabled?: boolean;
    amount?: number | null;
    currency?: string;
    description?: string;
    paymentLinkUrl?: string;
    status?: 'pending' | 'paid';
    requestedAt?: Date | string | null;
    paidAt?: Date | string | null;
  } | null;
}

export type DocumentFieldType =
  | 'signature'
  | 'text'
  | 'full_name'
  | 'date'
  | 'checkbox'
  | 'radio'
  | 'dropdown'
  | 'image'
  | 'initials'
  | 'live_photo'
  | 'stamp';

export interface DocumentField {
  id: string;
  repeatGroupId?: string;
  repeatSourceId?: string;
  type: DocumentFieldType;
  x: number;
  y: number;
  width: number;
  height: number;
  pageNumber?: number;
  recipientId?: string | null | undefined;
  required: boolean;
  value?: string;
  placeholder?: string;
  settings?: FieldPropertySettings;
  mimeType?: string;
  pageRect?: PageRect | DOMRect | null;
  fieldOwner?: FieldOwner;
}

export interface SigningViewDocument {
  id: string;
  fileUrl: string;
  name: string;
  fields: DocumentField[];
  recipients: Recipient[];
  currentRecipientId?: string;
  currentRecipient?: Recipient;
  status: string;
  signingMode?: 'sequential' | 'parallel';
  paymentRequest?: {
    enabled?: boolean;
    amount?: number;
    currency?: string;
    description?: string;
    paymentLinkUrl?: string;
    status?: 'pending' | 'paid';
  } | null;
  deletedAt?: string | null;
}

export interface IEditHistory {
  sessionId: string;
  fields: DocumentField[];
  documentName?: string;
  timestamp: Date;
  changeLog: string;
}

export interface IDocumentVersion {
  version: number;
  label?: string;
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
  storage?: {
    provider: string;
    bucket?: string;
    region?: string;
    key?: string;
    url?: string;
    versionId?: string;
  };
  hash?: string;
  hashAlgo?: string;
  size?: number;
  mimeType?: string;
  locked?: boolean;
  derivedFromVersion?: number;
  fileUrl?: string;
  pdfData?: Buffer;
  fields?: DocumentField[];
  documentName?: string;
  filePath?: string;
  sentAt?: Date;
  signingToken?: string;
  expiresAt?: Date;
  status?: 'draft' | 'sent' | 'signed' | 'expired' | 'final' | 'locked';
  changeLog?: string;
  editHistory?: IEditHistory[];
  createdAt?: Date;
  updatedAt?: Date;
  canvasWidth?: number;
  canvasHeight?: number;
}

export interface IDocument {
  _id: string;
  userId: string;
  orgId?: string;
  teamId?: string | null;
  documentName: string;
  originalFileName: string;
  currentVersion: number;
  currentSessionId?: string;
  editableContent?: EditableTemplateContent;
  templatePreparation?: {
    completed: boolean;
    variableValues?: Record<string, string>;
    excludedVariableKeys?: string[];
    completedAt?: Date;
    fieldsNeedReview?: boolean;
  };
  sequentialSigning?: boolean;
  signingMode?: 'parallel' | 'sequential';
  signingEvents?: Array<{
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
  }>;
  versions: {
    version: number;
    pdfData?: Buffer;
    fields?: unknown[];
    status?: string;
    changeLog?: string;
    filePath?: string;
    signingToken?: string;
    sentAt?: Date;
    expiresAt?: Date;
    signedBy?: string[];
    derivedFromVersion?: number;
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
  }[];
  auditTrailVersion?: number;
  completedAt?: Date;
  finalizedAt?: Date;
  derivedFromDocumentId?: string | { toString(): string };
  derivedFromVersion?: number;
  recipients?: Recipient[];
  status?:
    | 'draft'
    | 'saved'
    | 'sent'
    | 'viewed'
    | 'in_progress'
    | 'signed'
    | 'approved'
    | 'completed'
    | 'rejected'
    | 'delivery_failed'
    | 'expired'
    | 'cancelled'
    | 'voided'
    | 'pending';
  token?: string;
  createdAt?: Date;
  updatedAt?: Date;
  expiresAt?: Date;
  usageCount?: number;
  isTemplate?: boolean;
  statusBeforeDelete?: string;
  retention?: {
    docType?: string;
    jurisdiction?: string;
    governingLaw?: string;
    customTriggerAt?: Date;
    policy?: {
      policyId?: string;
      name?: string;
      docType?: string;
      jurisdiction?: string;
      triggerEvent?: 'createdAt' | 'completedAt' | 'finalizedAt' | 'expiresAt' | 'custom';
      durationDays?: number;
      regime?: string;
      priority?: number;
    };
    triggerEvent?: 'createdAt' | 'completedAt' | 'finalizedAt' | 'expiresAt' | 'custom';
    triggerAt?: Date;
    startAt?: Date;
    endAt?: Date;
    status?: 'unclassified' | 'pending_trigger' | 'active' | 'eligible' | 'on_hold';
    lastEvaluatedAt?: Date;
  };
  legalHold?: {
    status?: 'none' | 'active' | 'unknown';
    holdIds?: string[];
    lastCheckedAt?: Date;
  };
}

export interface UploadResult {
  fileUrl?: string;
  documentName?: string;
  documentId?: string;
  version?: number;
  message?: string;
  [key: string]: unknown;
}

export interface HandleSavePDFOptions {
  isServerSave?: boolean;
  isDownload?: boolean;
  isMergeFields?: boolean;
}
