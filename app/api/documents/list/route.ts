import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { getAuthContext } from '@/lib/auth-context';
import { unauthorizedResponse } from '@/lib/auth';
import DocumentModel from '@/models/Document';
import TeamModel from '@/models/Team';
import UserModel from '@/models/Users';
import type { IDocumentVersion } from '@/types/types';
import type { IDocument } from '@/models/Document';
import { getUpdatedDocumentStatus } from '@/lib/statusLogic';
import { hasCompletionEvidence } from '@/lib/document-guards';
import { sanitizeRecipients } from '@/lib/recipient-sanitizer';
import connectDB from '@/utils/db';
import { buildAccessibleDocumentQuery, resolveDocumentReadScope } from '@/lib/document-access';
import { getDocumentShareForEmail } from '@/lib/document-sharing';

const MAX_PAGE_SIZE = 100;

// Keep the dashboard list query intentionally narrow. Version payloads can include
// PDFs, fields, edit history, and storage metadata; the list only needs these four
// version properties to derive its metadata and effective status.
const DOCUMENT_LIST_PROJECTION = [
  '_id',
  'userId',
  'teamId',
  'documentName',
  'isTemplate',
  'editableContent.version',
  'originalFileName',
  'currentVersion',
  'status',
  'deletedAt',
  'statusBeforeDelete',
  'completedAt',
  'finalizedAt',
  'expiresAt',
  'createdAt',
  'updatedAt',
  'recipients',
  'versions.version',
  'versions.label',
  'versions.sentAt',
  'versions.expiresAt',
  'signingEvents.recipientId',
  'signingEvents.action',
  'retention.status',
  'retention.endAt',
  'legalHold.status',
  'legalHold.holdIds',
  'paymentRequest.enabled',
  'paymentRequest.amount',
  'paymentRequest.currency',
  'paymentRequest.description',
  'paymentRequest.paymentLinkUrl',
  'paymentRequest.status',
  'paymentRequest.requestedAt',
  'paymentRequest.paidAt',
  'sharedWith.email',
  'sharedWith.contact',
  'sharedWith.name',
  'sharedWith.contactId',
  'sharedWith.access',
  'sharedWith.sharedBy',
  'sharedWith.recipientUserId',
  'sharedWith.accountStatus',
  'sharedWith.sharedAt',
  'sharedWith.updatedAt',
  'sharedWith.lastNotificationAt',
  'sharedWith.accountClaimSentAt',
  'sharedWith.revokedAt',
].join(' ');

type DocumentListRecord = Omit<IDocument, 'status' | 'versions'> & {
  _id: mongoose.Types.ObjectId | string;
  status?: IDocument['status'] | 'trashed';
  versions?: IDocumentVersion[];
};

export async function GET(req: NextRequest) {
  try {
    const context = await getAuthContext(req);
    if (!context?.userId) {
      return unauthorizedResponse();
    }

    await connectDB();

    const { searchParams } = new URL(req.url);
    const pageParam = searchParams.get('page');
    const limitParam = searchParams.get('limit');
    const status = searchParams.get('status');

    const page = pageParam ? parseInt(pageParam, 10) : 1;
    const limitRaw = limitParam ? parseInt(limitParam, 10) : null;

    if (!Number.isInteger(page) || page < 1) {
      return NextResponse.json({ message: 'Invalid page. page must be a positive integer.' }, { status: 400 });
    }
    if (limitRaw !== null && (!Number.isInteger(limitRaw) || limitRaw < 1 || limitRaw > MAX_PAGE_SIZE)) {
      return NextResponse.json({ message: `Invalid limit. limit must be an integer between 1 and ${MAX_PAGE_SIZE}.` }, { status: 400 });
    }

    const limit = limitRaw;

    const [readScope, requester] = await Promise.all([
      resolveDocumentReadScope(
        context.userId,
        context.orgId,
        context.orgRole
      ),
      mongoose.Types.ObjectId.isValid(context.userId)
        ? UserModel.findById(context.userId)
            .select('email')
            .lean<{ email?: unknown } | null>()
        : Promise.resolve(null),
    ]);
    const requesterEmail = typeof requester?.email === 'string' ? requester.email : null;
    const query: Record<string, unknown> = buildAccessibleDocumentQuery({
      userId: context.userId,
      orgId: context.orgId,
      orgRole: context.orgRole,
      userEmail: requesterEmail,
      accessibleTeamIds: readScope.accessibleTeamIds,
    });
    if (status && status !== 'all') {
      query.status = status;
    }

    let mongooseQuery = DocumentModel.find(query)
      .select(DOCUMENT_LIST_PROJECTION)
      .sort({ updatedAt: -1 });

    if (limit !== null) {
      mongooseQuery = mongooseQuery
        .skip((page - 1) * limit)
        .limit(limit);
    }

    const documentsQuery = mongooseQuery.lean<DocumentListRecord[]>();
    const [documents, total] = await Promise.all([
      documentsQuery,
      // The unpaginated dashboard response never exposes a total. Avoid a full
      // count in its most common path; paginated callers still receive it.
      limit !== null ? DocumentModel.countDocuments(query) : Promise.resolve(0),
    ]);

    const teamIds = Array.from(
      new Set(
        documents
          .map((doc) => (doc.teamId ? String(doc.teamId) : null))
          .filter((teamId): teamId is string => Boolean(teamId))
      )
    );
    const teams = teamIds.length
      ? await TeamModel.find({ _id: { $in: teamIds } })
          .select('name')
          .lean<Array<{ _id: { toString(): string } | string; name?: string }>>()
      : [];
    const teamNameById = new Map(
      teams.map((team) => [String(team._id), team.name || 'Untitled team'])
    );

    const documentsWithMetadata = documents.map(doc => {
      const versions = Array.isArray(doc.versions) ? doc.versions : [];
      const storedStatus = doc.status ?? 'draft';
      const statusSource = {
        ...doc,
        status: storedStatus,
        versions,
        recipients: Array.isArray(doc.recipients) ? doc.recipients : [],
      } as unknown as IDocument;
      const currentStatus = !doc.deletedAt && storedStatus !== 'trashed'
        ? getUpdatedDocumentStatus(statusSource)
        : storedStatus;
      const effectiveStatus =
        doc.deletedAt
          ? (hasCompletionEvidence(statusSource)
            ? 'completed'
            : (doc.statusBeforeDelete ||
              (storedStatus === 'trashed'
                ? getUpdatedDocumentStatus(statusSource)
                : storedStatus)))
          : currentStatus;
      const canEditSource =
        String(doc.userId) === context.userId ||
        Boolean(getDocumentShareForEmail(doc.sharedWith, requesterEmail, 'can_edit'));
      return {
      id: doc._id,
      userId: doc.userId,
      teamId: doc.teamId ? String(doc.teamId) : null,
      teamName: doc.teamId ? (teamNameById.get(String(doc.teamId)) ?? null) : null,
      name: doc.documentName,
      isTemplate: doc.isTemplate ?? false,
      hasEditableContent: canEditSource && Boolean(doc.editableContent),
      originalFileName: doc.originalFileName,
      currentVersion: doc.currentVersion ?? 0,
      totalVersions: versions.length,
      status: effectiveStatus,
      recipients: sanitizeRecipients(doc.recipients || []),
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      lastSentAt: versions.find((v: IDocumentVersion) => !!v.sentAt)?.sentAt,
      expiresAt: versions.find((v: IDocumentVersion) => v.version === (doc.currentVersion ?? 0))?.expiresAt,
      deletedAt: doc.deletedAt ?? null,
      statusBeforeDelete: doc.statusBeforeDelete,
      retention: {
        status: doc.retention?.status ?? null,
        endAt: doc.retention?.endAt ?? null,
      },
      legalHold: {
        status: doc.legalHold?.status ?? 'none',
        holdCount: Array.isArray(doc.legalHold?.holdIds) ? doc.legalHold?.holdIds?.length : 0,
      },
      paymentRequest: doc.paymentRequest
        ? {
            enabled: Boolean(doc.paymentRequest.enabled),
            amount: doc.paymentRequest.amount ?? null,
            currency: doc.paymentRequest.currency ?? 'INR',
            description: doc.paymentRequest.description ?? '',
            paymentLinkUrl: doc.paymentRequest.paymentLinkUrl ?? '',
            status: doc.paymentRequest.status ?? 'pending',
            requestedAt: doc.paymentRequest.requestedAt ?? null,
            paidAt: doc.paymentRequest.paidAt ?? null,
          }
        : null,
      sharedWith: Array.isArray(doc.sharedWith)
        ? doc.sharedWith.filter((share: {
            revokedAt?: unknown;
          }) => share.revokedAt === null || share.revokedAt === undefined).map((share: {
            email?: string;
            contact?: string;
            name?: string;
            contactId?: unknown;
            access?: string;
            sharedBy?: string;
            recipientUserId?: string;
            accountStatus?: string;
            sharedAt?: unknown;
            updatedAt?: unknown;
            lastNotificationAt?: unknown;
            accountClaimSentAt?: unknown;
          }) => {
            const email = share.email || share.contact || '';
            return {
              email,
              name: share.name ?? '',
              contactId: share.contactId ? String(share.contactId) : undefined,
              access: share.access,
              sharedBy: share.sharedBy,
              recipientUserId: share.recipientUserId,
              accountStatus: share.accountStatus,
              sharedAt: share.sharedAt,
              updatedAt: share.updatedAt ?? null,
              lastNotificationAt: share.lastNotificationAt ?? null,
              accountClaimSentAt: share.accountClaimSentAt ?? null,
            };
          })
        : [],
      };
    });

    return NextResponse.json({
      success: true,
      documents: documentsWithMetadata,
      pagination: limit
        ? {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        }
        : null,
    });
  } catch (error) {
    console.error('API Error in GET /api/documents/list', error);
    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
  }
}
