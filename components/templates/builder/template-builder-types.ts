import type { DocumentField, Recipient } from '@/types/types';
import type { EditableTemplateContent } from '@/types/template-content';

export type TemplateFieldLayoutStatus = 'current' | 'needs_review';

export interface TemplateBuilderTemplate {
  _id: string;
  templateId?: string;
  name: string;
  description?: string;
  category: string;
  jurisdiction?: string;
  isSystemTemplate: boolean;
  sharingScope?: 'private' | 'workspace';
  userId?: string;
  orgId?: string;
  fields: DocumentField[];
  defaultSigners: Array<{
    id?: string;
    name?: string;
    email?: string;
    role: 'signer' | 'approver' | 'viewer';
    order: number;
  }>;
  recipients?: Recipient[];
  editableContent?: EditableTemplateContent | null;
  templateFileUrl?: string;
  thumbnailUrl?: string;
  pageCount?: number;
  fileSize?: number;
  tags?: string[];
  updatedAt?: string;
  fieldLayoutStatus?: TemplateFieldLayoutStatus;
  layoutRevision?: number;
  fieldLayoutRevision?: number;
}

export type TemplateBuilderWorkspace = 'content' | 'fields' | 'review' | 'settings';
