import type { PricingTierId } from '@/lib/subscription-plans';

export interface Address {
  country?: string;
  street?: string;
  apartment?: string;
  city?: string;
  state?: string;
  zip?: string;
}

export interface SignatureInitial {
  id: string;
  value: string;
  type: 'typed' | 'drawn';
  isDefault: boolean;
}

export interface User {
  email: string;
  password?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  picture?: string;
  id?: string;
  initials?: SignatureInitial[];
  signatures?: SignatureInitial[];
  stamps?: SignatureInitial[];
  phone?: string;
  address?: Address;
  role?: string;
  orgId?: string | null;
  orgRole?: string | null;
  primaryOrgId?: string | null;
  orgPlan?: string | null;
  workspaceTier?: PricingTierId;
  createdAt?: Date;
  updatedAt?: string;
}

export type ItemType = 'Signature' | 'Initials' | 'Stamp';
