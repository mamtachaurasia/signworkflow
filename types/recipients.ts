export interface Recipient {
  signingToken?: string;
  captureGpsLocation?: boolean;
  id: string;
  email: string;
  name: string;
  role: 'signer' | 'approver' | 'viewer';
  color: string;
  order: number;
  isCC?: boolean;
  totalFields?: number;
  status:
    | 'signed'
    | 'sent'
    | 'approved'
    | 'rejected'
    | 'pending'
    | 'viewed'
    | 'delivery_failed'
    | 'expired';
  rejectedAt?: Date | null;
  signedAt?: Date | null;
  signedVersion?: number | null;
  approvedAt?: Date | null;
  viewedAt?: Date | null;
  ipAddress?: string;
  location?: {
    latitude?: number;
    longitude?: number;
    accuracyMeters?: number;
    city?: string;
    state?: string;
    country?: string;
    capturedAt?: Date;
  };
  device?: {
    type?: 'mobile' | 'desktop' | 'tablet';
    os?: string;
    browser?: string;
    userAgent?: string;
  };
  network?: {
    ip?: string;
    ipUnavailableReason?: string;
    isp?: string;
    ipLocation?: {
      city?: string;
      country?: string;
    };
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
  identityVerification?: {
    method?: 'email' | 'sms' | 'kba' | 'id_document' | 'bank_id' | 'selfie' | 'manual' | 'none';
    provider?: string;
    result?: 'passed' | 'failed' | 'skipped';
    verifiedAt?: Date;
    transactionId?: string;
    payloadHash?: string;
  };
  authentication?: {
    method?: 'email' | 'sms' | 'otp' | 'sso' | 'none';
    channel?: string;
    verifiedAt?: Date;
    transactionId?: string;
  };
}

export interface Contact {
  _id?: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  companyName?: string;
  jobTitle?: string;
  address?: {
    country?: string;
    streetAddress?: string;
    apartment?: string;
    city?: string;
    state?: string;
    zipCode?: string;
  };
  description?: string;
  userId: string;
  createdAt?: Date;
  updatedAt?: Date;
}
