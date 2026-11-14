import type { TemplateJurisdiction } from '@/config/template-jurisdictions';
import type { EditableTemplateContent } from '@/types/template-content';
import type { DocumentField } from '@/types/types';

export interface Template {
  _id: string;
  name: string;
  description?: string;
  category: string;
  jurisdiction?: TemplateJurisdiction;
  editableContent?: EditableTemplateContent;
  isSystemTemplate: boolean;
  sharingScope?: 'private' | 'workspace';
  userId?: string;
  orgId?: string;
  templateFileUrl: string;
  thumbnailUrl?: string;
  fileSize?: number;
  pageCount?: number;
  fields?: DocumentField[];
  fieldLayoutStatus?: 'current' | 'needs_review';
  layoutRevision?: number;
  fieldLayoutRevision?: number;
  defaultSigners?: Array<{
    id?: string;
    name?: string;
    email?: string;
    role: 'signer' | 'approver' | 'viewer';
    order: number;
  }>;
  tags?: string[];
  createdAt: Date;
  updatedAt?: Date | string;
  duplicateCount?: number;
  deletedAt?: Date;
  documentId?: string | null;
  isActive?: boolean;
}

export interface CreateDocumentFromTemplateResult {
  documentId: string;
  sessionId: string;
  guestId?: string | null;
  recipients?: Array<{
    id: string;
    name: string;
    email: string;
    role: 'signer' | 'approver' | 'viewer';
    order: number;
  }>;
  fields?: Array<Record<string, unknown>>;
}

export type TemplateSaveMode = 'create' | 'update';

export type TemplateMetadataInput = {
  name: string;
  description?: string;
  category: string;
  tags?: string[];
};

export type CreateTemplateInput = Partial<Template> & {
  saveMode?: TemplateSaveMode;
  existingTemplateId?: string;
  replaceConfirmation?: boolean;
  metadata?: TemplateMetadataInput;
};

export type CreateScratchTemplateInput = {
  name?: string;
};
