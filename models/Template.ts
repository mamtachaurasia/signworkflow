import mongoose, { Schema } from 'mongoose';
import { DocumentField } from '@/types/types';
import type { TemplateSharingScope } from '@/lib/template-access';
import { TEMPLATE_CATEGORIES, type TemplateCategory } from '@/config/template-categories';
import { TEMPLATE_JURISDICTIONS, type TemplateJurisdiction } from '@/config/template-jurisdictions';
import type { EditableTemplateContent } from '@/types/template-content';
import type { TemplateFieldLayoutStatus } from '@/lib/template-layout';
import type { TemplateArtifact, TemplateArtifacts } from '@/lib/template-artifacts';

export interface ITemplateField extends DocumentField {
    // Extends DocumentField with template-specific properties
    defaultValue?: string;
    helpText?: string;
}

export interface ITemplateDefaultSigner {
    id?: string;
    name?: string;
    email?: string;
    role: 'signer' | 'approver' | 'viewer';
    order: number;
}

export interface ITemplate {
    _id?: string;
    userId: string; // owner, null for system templates
    orgId?: mongoose.Schema.Types.ObjectId;
    sharingScope?: TemplateSharingScope;
    name: string;
    description?: string;
    category: TemplateCategory;
    jurisdiction?: TemplateJurisdiction;
    isSystemTemplate: boolean;
    templateFileUrl: string; // URL to the PDF template file
    thumbnailUrl?: string; // thumbnail/preview image
    fields: ITemplateField[]; // pre-configured fields
    defaultSigners?: ITemplateDefaultSigner[]; // pre-configured signers
    editableContent?: EditableTemplateContent;
    fieldLayoutStatus?: TemplateFieldLayoutStatus;
    layoutRevision?: number;
    fieldLayoutRevision?: number;
    /** Persistent S3/R2 artifacts. `filePath` is legacy-only while data is migrated. */
    artifacts?: TemplateArtifacts;
    filePath?: string;
    fileSize?: number;
    pageCount?: number;
    duplicateCount?: number; // track how many times this template has been used
    isActive: boolean;
    tags?: string[]; // for searching
    createdAt: Date;
    updatedAt: Date;
    deletedAt?: Date;
}

const TemplatePageRectSchema = new Schema(
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

const TemplateFieldSchema = new Schema<ITemplateField>({
    id: { type: String, required: true },
    repeatGroupId: { type: String },
    repeatSourceId: { type: String },
    type: { type: String, required: true, enum: ['signature', 'text', 'full_name', 'date', 'checkbox', 'radio', 'dropdown', 'image', 'initials', 'live_photo', 'stamp'] },
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    pageNumber: { type: Number, required: true },
    pageRect: { type: TemplatePageRectSchema },
    recipientId: { type: String },
    fieldOwner: { type: String, enum: ['me', 'recipients'] },
    required: { type: Boolean, default: true },
    value: { type: String, default: '' },
    placeholder: { type: String },
    settings: { type: Schema.Types.Mixed, default: undefined },
    mimeType: { type: String },
    defaultValue: { type: String },
    helpText: { type: String },
});

const TemplateDefaultSignerSchema = new Schema<ITemplateDefaultSigner>({
    id: { type: String },
    name: { type: String },
    email: { type: String },
    role: { type: String, enum: ['signer', 'approver', 'viewer'], default: 'signer' },
    order: { type: Number, required: true },
});

const TemplateArtifactStorageSchema = new Schema(
    {
        provider: { type: String, enum: ['s3', 'r2'], required: true },
        bucket: { type: String, required: true },
        region: { type: String },
        key: { type: String, required: true },
        url: { type: String },
        versionId: { type: String },
    },
    { _id: false }
);

const TemplateArtifactSchema = new Schema<TemplateArtifact>(
    {
        storage: { type: TemplateArtifactStorageSchema, required: true },
        contentType: { type: String, required: true },
        size: { type: Number, required: true, min: 0 },
        sha256: { type: String },
        originalFileName: { type: String },
    },
    { _id: false }
);

const TemplateArtifactsSchema = new Schema<TemplateArtifacts>(
    {
        pdf: { type: TemplateArtifactSchema, required: true },
        source: { type: TemplateArtifactSchema, required: false },
    },
    { _id: false }
);

const TemplateSchema = new Schema<ITemplate>(
    {
        userId: { type: String, sparse: true }, // null for system templates
        orgId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', index: true },
        sharingScope: { type: String, enum: ['private', 'workspace'], default: 'private', index: true },
        name: { type: String, required: true },
        description: { type: String },
        category: { type: String, enum: [...TEMPLATE_CATEGORIES], default: 'Other' },
        jurisdiction: { type: String, enum: [...TEMPLATE_JURISDICTIONS], default: 'International', index: true },
        isSystemTemplate: { type: Boolean, default: false },
        templateFileUrl: { type: String, required: true },
        thumbnailUrl: { type: String },
        artifacts: { type: TemplateArtifactsSchema, default: undefined },
        fields: { type: [TemplateFieldSchema], default: [] },
        defaultSigners: { type: [TemplateDefaultSignerSchema], default: [] },
        editableContent: { type: Schema.Types.Mixed, default: undefined },
        fieldLayoutStatus: { type: String, enum: ['current', 'needs_review'], default: 'current' },
        layoutRevision: { type: Number, min: 1, default: 1 },
        fieldLayoutRevision: { type: Number, min: 1, default: 1 },
        // Legacy local path retained only to support an explicit migration of
        // existing records. New writes must use `artifacts`.
        filePath: { type: String, required: false },
        fileSize: { type: Number },
        pageCount: { type: Number },
        duplicateCount: { type: Number, default: 0 },
        isActive: { type: Boolean, default: true },
        tags: { type: [String], default: [] },
        deletedAt: { type: Date, default: null },
    },
    { timestamps: true }
);

// Indexes for performance
TemplateSchema.index({ orgId: 1, userId: 1, isSystemTemplate: 1 });
TemplateSchema.index({ orgId: 1, sharingScope: 1, isSystemTemplate: 1 });
TemplateSchema.index({ category: 1 });
TemplateSchema.index({ isActive: 1 });
TemplateSchema.index({ tags: 1 });
TemplateSchema.index({ name: 'text', description: 'text' }); // text search

export default mongoose.models.Template || mongoose.model<ITemplate>('Template', TemplateSchema);
