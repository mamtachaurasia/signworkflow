import Document from '@/models/Document';
import TemplateModel, { type ITemplate } from '@/models/Template';
import { sha256Buffer } from '@/lib/hash';
import { deleteObject, getRegion, putObjectStream, getStorageBucketName, getStorageProvider } from '@/lib/s3';
import { renderEditableTemplatePdf } from '@/lib/template-content-pdf';
import { sanitizeTemplateFields } from '@/lib/template-persistence';
import { normalizeTemplateDefaultSigners } from '@/lib/template-signers';
import { getTemplatePdfArtifact, readTemplateArtifactBuffer } from '@/lib/template-artifacts';

type CreateDocumentFromTemplateArgs = {
  template: ITemplate;
  ownerId: string;
  orgId?: string | null;
  documentName?: string | null;
  variableValues?: Record<string, string>;
  recipientAssignments?: Array<{ id: string; name: string; email: string; role: 'signer' | 'approver' | 'viewer'; order: number }>;
  deferPreparation?: boolean;
};

function sanitizeTemplateFieldsForPreparedVersion(fields: unknown[]) {
  // Keep the saved page geometry with the snapshot. It is needed for the
  // Builder's immediate field placement and remains review-gated when editable
  // content reflows the generated PDF.
  return sanitizeTemplateFields(fields);
}

export async function resolveTemplatePdfBuffer(template: ITemplate): Promise<Buffer> {
  const pdfArtifact = getTemplatePdfArtifact(template);
  if (!pdfArtifact) {
    throw new Error('Template PDF artifact is unavailable. Migrate the template before using it.');
  }
  return readTemplateArtifactBuffer(pdfArtifact);
}

export async function createDocumentFromTemplateRecord(
  args: CreateDocumentFromTemplateArgs
): Promise<{
  documentId: string;
  sessionId: string;
  guestId: string | null;
  recipients: Array<{ id: string; name: string; email: string; role: 'signer' | 'approver' | 'viewer'; order: number }>;
  fields: unknown[];
}> {
  const template = args.template;
  const ownerId = args.ownerId;
  const newSessionId = ownerId.startsWith('guest_')
    ? ownerId
    : `session_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  const documentName = args.documentName?.trim() || `New Document from ${template.name}`;
  const definitions = template.editableContent?.variables || [];
  const hasVariableOverrides = definitions.some((variable) =>
    Object.prototype.hasOwnProperty.call(args.variableValues || {}, variable.key) &&
    (args.variableValues?.[variable.key] || '') !== (variable.defaultValue || '')
  );
  const pdfData = hasVariableOverrides
    ? await renderEditableTemplatePdf(template.editableContent!, args.variableValues)
    : await resolveTemplatePdfBuffer(template);
  const preparedFields = sanitizeTemplateFieldsForPreparedVersion(template.fields ?? []);
  const fieldsNeedReview = hasVariableOverrides && preparedFields.length > 0;
  const reusableRoles = normalizeTemplateDefaultSigners(
    template.defaultSigners || [],
    template.fields || [],
    String(template._id)
  );
  const assignedRecipients = Array.isArray(args.recipientAssignments) && args.recipientAssignments.length > 0
    ? args.recipientAssignments
    : reusableRoles;
  const normalizedAssignedRecipients = assignedRecipients.map((recipient, index) => ({
    ...recipient,
    id: recipient.id || `role_${index + 1}`,
    name: recipient.name?.trim() || `${recipient.role.charAt(0).toUpperCase()}${recipient.role.slice(1)} ${index + 1}`,
    email: recipient.email?.trim().toLowerCase() || '',
    order: recipient.order || index + 1,
  }));
  const hash = await sha256Buffer(pdfData);
  const size = pdfData.length;
  const mimeType = 'application/pdf';
  const storageProvider = getStorageProvider();
  const bucket = getStorageBucketName(storageProvider);
  if (!bucket) {
    throw new Error('Storage bucket is not configured.');
  }

  const newDocument = new Document({
    orgId: args.orgId || undefined,
    userId: ownerId,
    documentName,
    originalFileName: template.name,
    currentVersion: 1,
    currentSessionId: newSessionId,
    status: 'draft',
    isTemplate: false,
    versions: [],
    recipients: normalizedAssignedRecipients
      .map((recipient) => ({
        id: recipient.id,
        name: recipient.name,
        email: recipient.email,
        role: recipient.role,
        order: recipient.order,
        signingToken: undefined,
        signingTokenHash: undefined,
        status: 'pending',
        signedAt: null,
        signedVersion: null,
        approvedAt: null,
        rejectedAt: null,
        viewedAt: null,
      })),
    templateId: template._id,
    templatePreparation: template.editableContent?.variables?.length
      ? {
          completed: !args.deferPreparation,
          variableValues: args.deferPreparation ? {} : (args.variableValues || {}),
          completedAt: args.deferPreparation ? undefined : new Date(),
          fieldsNeedReview,
        }
      : { completed: true, variableValues: {}, completedAt: new Date(), fieldsNeedReview: false },
  });

  const originalKey = `documents/${ownerId}/${newDocument._id}/original.pdf`;
  let originalObjectStored = false;

  const originalVersion = {
    version: 0,
    label: 'original' as const,
    storage: {
      provider: storageProvider,
      bucket,
      key: originalKey,
      region: getRegion(storageProvider),
      url: `${storageProvider}://${bucket}/${originalKey}`,
    },
    hash,
    hashAlgo: 'SHA-256',
    size,
    mimeType,
    locked: true,
    status: 'locked' as const,
    ingestionNote: `Created from template: ${template.name}`,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const preparedVersion = {
    version: 1,
    label: 'prepared' as const,
    derivedFromVersion: 0,
    storage: {
      provider: storageProvider,
      bucket,
      key: originalKey,
      region: getRegion(storageProvider),
      url: `${storageProvider}://${bucket}/${originalKey}`,
    },
    hash,
    hashAlgo: 'SHA-256',
    size,
    mimeType,
    locked: false,
    // Variable values can reflow the generated PDF. Keep the reusable field configuration
    // visible for review instead of silently discarding it.
    fields: preparedFields,
    documentName,
    status: 'draft' as const,
    changeLog: `Created from template: ${template.name}`,
    editHistory: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  try {
    await putObjectStream({
      bucket,
      key: originalKey,
      body: pdfData,
      contentType: mimeType,
      contentLength: size,
      provider: storageProvider,
    });
    originalObjectStored = true;

    newDocument.versions.push(originalVersion, preparedVersion);
    await newDocument.save();
  } catch (error) {
    if (originalObjectStored) {
      try {
        await deleteObject({
          bucket,
          key: originalKey,
          region: getRegion(storageProvider),
          provider: storageProvider,
        });
      } catch (cleanupError) {
        console.error('[CREATE DOCUMENT FROM TEMPLATE] Failed to remove unfinished document artifact:', cleanupError);
      }
    }
    throw error;
  }

  // This is usage metadata, not part of the document's durability boundary.
  // Do not fail an otherwise-created agreement if an analytics counter update
  // is temporarily unavailable.
  try {
    await TemplateModel.updateOne({ _id: template._id }, { $inc: { duplicateCount: 1 } });
  } catch (counterError) {
    console.error('[CREATE DOCUMENT FROM TEMPLATE] Failed to increment template usage count:', counterError);
  }

  return {
    documentId: newDocument._id.toString(),
    sessionId: newSessionId,
    guestId: ownerId.startsWith('guest_') ? ownerId : null,
    recipients: newDocument.recipients.map((recipient: { id: string; name: string; email: string; role: 'signer' | 'approver' | 'viewer'; order?: number }) => ({ id: recipient.id, name: recipient.name, email: recipient.email, role: recipient.role, order: recipient.order || 1 })),
    fields: preparedFields,
  };
}
