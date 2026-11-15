import { NextRequest, NextResponse } from 'next/server';
import { resolvePublicBaseUrl } from '@/lib/app-url';
import mongoose from 'mongoose';
import connectDB from '@/utils/db';
import Document from '@/models/Document';
import Contact from '@/models/Contact';
import User from '@/models/Users';
import { getAuthContext } from '@/lib/auth-context';
import { sendDocumentShareEmail } from '@/lib/email';
import {
  documentShareAccessRequiresAccount,
  ensureDocumentShareAccountInvite,
} from '@/lib/document-share-account-invites';
import {
  issueDocumentShareToken,
  isDocumentShareAccess,
  normalizeShareEmail,
  type DocumentShareAccess,
} from '@/lib/document-sharing';

type ContactRecord = {
  _id?: { toString(): string } | string;
  firstName?: string;
  lastName?: string;
  email?: string;
  companyName?: string;
};

type ShareActorRecord = {
  email?: unknown;
  name?: unknown;
  firstName?: unknown;
  lastName?: unknown;
};

function getDocumentBuilderPath(documentId: string): string {
  return `/builder/${encodeURIComponent(documentId)}`;
}

function buildShareLink(args: {
  req: NextRequest;
  documentId: string;
  email: string;
  access: DocumentShareAccess;
  shareToken?: string;
  requiresAccountClaim?: boolean;
}): string {
  const baseUrl = resolvePublicBaseUrl({ req: args.req });
  const builderPath = getDocumentBuilderPath(args.documentId);

  if (args.requiresAccountClaim && args.shareToken) {
    return `${baseUrl}/reset-password?shareToken=${encodeURIComponent(args.shareToken)}&email=${encodeURIComponent(args.email)}&next=${encodeURIComponent(builderPath)}`;
  }

  if (documentShareAccessRequiresAccount(args.access)) {
    return `${baseUrl}/login?email=${encodeURIComponent(args.email)}&next=${encodeURIComponent(builderPath)}`;
  }

  const shareTokenParam = args.shareToken ? `?shareToken=${encodeURIComponent(args.shareToken)}` : '';
  return `${baseUrl}${builderPath}${shareTokenParam}`;
}

async function loadShareActor(userId: string): Promise<{
  email: string | null;
  name: string;
}> {
  const currentUser = await User.findById(userId)
    .select('email name firstName lastName')
    .lean<ShareActorRecord | null>();
  const email = typeof currentUser?.email === 'string' ? currentUser.email : null;
  const name =
    typeof currentUser?.name === 'string' && currentUser.name.trim()
      ? currentUser.name.trim()
      : [currentUser?.firstName, currentUser?.lastName]
          .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
          .join(' ')
          .trim();

  return { email, name };
}

function getContactName(contact: ContactRecord | null): string {
  if (!contact) return '';
  return [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim();
}

function normalizeName(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').toLowerCase() : '';
}

async function resolveShareTarget(args: {
  userId: string;
  orgId: string | null;
  contact: string;
  contactEmail?: string;
  contactId?: string;
}): Promise<{ email: string; name?: string; contactId?: string } | { error: string }> {
  const directEmail = normalizeShareEmail(args.contactEmail) || normalizeShareEmail(args.contact);
  let selectedContact: ContactRecord | null = null;

  if (args.contactId) {
    if (!mongoose.Types.ObjectId.isValid(args.contactId)) {
      return { error: 'Contact not found' };
    }

    selectedContact = await Contact.findOne({
      _id: args.contactId,
      userId: args.userId,
      ...(args.orgId ? { orgId: args.orgId } : {}),
    })
      .select('firstName lastName email companyName')
      .lean<ContactRecord | null>();

    if (!selectedContact) {
      return { error: 'Contact not found' };
    }
  }

  if (!selectedContact && directEmail) {
    selectedContact = await Contact.findOne({
      userId: args.userId,
      ...(args.orgId ? { orgId: args.orgId } : {}),
      email: directEmail,
    })
      .select('firstName lastName email companyName')
      .lean<ContactRecord | null>();
  }

  if (!selectedContact && !directEmail && args.contact) {
    const contacts = await Contact.find({
      userId: args.userId,
      ...(args.orgId ? { orgId: args.orgId } : {}),
    })
      .select('firstName lastName email companyName')
      .lean<ContactRecord[]>();
    const normalizedInput = normalizeName(args.contact);
    const matches = contacts.filter((candidate) => {
      const fullName = normalizeName(getContactName(candidate));
      const email = normalizeName(candidate.email);
      const companyName = normalizeName(candidate.companyName);
      return (
        fullName === normalizedInput ||
        email === normalizedInput ||
        (companyName.length > 0 && companyName === normalizedInput)
      );
    });

    if (matches.length === 1) {
      selectedContact = matches[0];
    } else if (matches.length > 1) {
      return { error: 'Multiple contacts matched. Pick a contact from the list.' };
    }
  }

  const email = normalizeShareEmail(selectedContact?.email) || directEmail;
  if (!email) {
    return { error: 'Enter a valid email address or pick a contact.' };
  }

  const selectedContactId = selectedContact?._id ? String(selectedContact._id) : undefined;
  return {
    email,
    name: getContactName(selectedContact) || undefined,
    contactId: selectedContactId,
  };
}

function serializeActiveShares(sharedWith: unknown) {
  return Array.isArray(sharedWith)
    ? sharedWith
        .filter((entry) => {
          const share = (entry ?? {}) as Record<string, unknown>;
          return share.revokedAt === null || share.revokedAt === undefined;
        })
        .map((entry) => {
          const share = (entry ?? {}) as Record<string, unknown>;
          const email = normalizeShareEmail(share.email) || normalizeShareEmail(share.contact) || '';
          return {
            email,
            name: typeof share.name === 'string' ? share.name : '',
            contactId: share.contactId ? String(share.contactId) : undefined,
            access: isDocumentShareAccess(share.access) ? share.access : 'can_view',
            sharedBy: typeof share.sharedBy === 'string' ? share.sharedBy : undefined,
            recipientUserId: typeof share.recipientUserId === 'string' ? share.recipientUserId : undefined,
            accountStatus:
              share.accountStatus === 'registered' ||
              share.accountStatus === 'pending' ||
              share.accountStatus === 'guest'
                ? share.accountStatus
                : undefined,
            sharedAt: share.sharedAt ?? null,
            updatedAt: share.updatedAt ?? null,
            lastNotificationAt: share.lastNotificationAt ?? null,
            accountClaimSentAt: share.accountClaimSentAt ?? null,
          };
        })
        .filter((share) => Boolean(share.email))
    : [];
}

async function loadOwnedDocumentForSharing(documentId: string, userId: string) {
  await connectDB();

  if (!mongoose.Types.ObjectId.isValid(documentId)) {
    return { response: NextResponse.json({ message: 'Invalid document id' }, { status: 400 }) };
  }

  const document = await Document.findById(documentId);
  if (!document) {
    return { response: NextResponse.json({ message: 'Document not found' }, { status: 404 }) };
  }

  if (String(document.userId) !== String(userId)) {
    return { response: NextResponse.json({ message: 'Forbidden' }, { status: 403 }) };
  }

  return { document };
}

export async function POST(req: NextRequest) {
  try {
    const context = await getAuthContext(req);
    if (!context?.userId) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const documentId = typeof body?.documentId === 'string' ? body.documentId.trim() : '';
    const contact = typeof body?.contact === 'string' ? body.contact.trim() : '';
    const contactEmail = typeof body?.contactEmail === 'string' ? body.contactEmail.trim() : '';
    const contactId = typeof body?.contactId === 'string' ? body.contactId.trim() : '';
    const access = typeof body?.access === 'string' ? body.access : '';

    if (!documentId || (!contact && !contactEmail) || !isDocumentShareAccess(access)) {
      return NextResponse.json({ message: 'Invalid payload' }, { status: 400 });
    }

    const loaded = await loadOwnedDocumentForSharing(documentId, String(context.userId));
    if ('response' in loaded) return loaded.response;
    const { document } = loaded;

    const target = await resolveShareTarget({
      userId: String(context.userId),
      orgId: context.orgId,
      contact,
      contactEmail,
      contactId,
    });

    if ('error' in target) {
      return NextResponse.json({ message: target.error }, { status: 400 });
    }

    const currentUser = await loadShareActor(String(context.userId));

    if (normalizeShareEmail(target.email) === normalizeShareEmail(currentUser.email)) {
      return NextResponse.json({ message: 'You already own this document.' }, { status: 400 });
    }

    const shares = Array.isArray(document.sharedWith)
      ? ([...document.sharedWith] as Array<Record<string, unknown>>)
      : [];
    const normalizedContact = target.email;
    const existingIndex = shares.findIndex((entry) => {
      const entryContact = normalizeShareEmail(entry.email) || normalizeShareEmail(entry.contact);
      return entryContact === normalizedContact;
    });
    const now = new Date();
    const existingShare = existingIndex >= 0 ? shares[existingIndex] : null;
    const issuedShareToken = issueDocumentShareToken();
    const accountInvite = await ensureDocumentShareAccountInvite({
      email: target.email,
      name: target.name,
      access: access as DocumentShareAccess,
      invitedBy: String(context.userId),
      documentId: String(document._id),
      now,
    });
    const shareEntry = {
      email: target.email,
      name: target.name,
      contactId: target.contactId,
      access,
      recipientUserId: accountInvite.userId,
      accountStatus: accountInvite.status,
      sharedAt: existingShare?.sharedAt || now,
      updatedAt: now,
      lastNotificationAt: now,
      accountClaimSentAt:
        accountInvite.status === 'pending'
          ? now
          : existingShare?.accountClaimSentAt,
      shareTokenHash: issuedShareToken.tokenHash,
      sharedBy: String(context.userId),
      revokedAt: undefined,
    };

    if (existingIndex >= 0) {
      shares[existingIndex] = shareEntry;
    } else {
      shares.push(shareEntry);
    }

    document.sharedWith = shares as typeof document.sharedWith;
    await document.save();

    let emailSent = false;
    let emailError: string | null = null;
    try {
      await sendDocumentShareEmail({
        toEmail: target.email,
        recipientName: target.name,
        documentName: document.documentName,
        access: access as DocumentShareAccess,
        sharedByName: currentUser.name || null,
        sharedByEmail: currentUser.email,
        shareLink: buildShareLink({
          req,
          documentId: String(document._id),
          email: target.email,
          access: access as DocumentShareAccess,
          shareToken: issuedShareToken.token,
          requiresAccountClaim: accountInvite.status === 'pending',
        }),
        requiresAccountClaim: accountInvite.status === 'pending',
      });
      emailSent = true;
    } catch (error) {
      emailError = error instanceof Error ? error.message : 'Failed to send email notification';
      console.error('Document share email failed', error);
    }

    return NextResponse.json({
      success: true,
      emailSent,
      emailError,
      share: {
        email: target.email,
        name: target.name,
        contactId: target.contactId,
        access,
        recipientUserId: accountInvite.userId,
        accountStatus: accountInvite.status,
        sharedBy: String(context.userId),
        sharedAt: shareEntry.sharedAt,
        updatedAt: shareEntry.updatedAt,
        lastNotificationAt: shareEntry.lastNotificationAt,
        accountClaimSentAt: shareEntry.accountClaimSentAt,
      },
    });
  } catch (error) {
    console.error('POST /api/documents/share failed', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const context = await getAuthContext(req);
    if (!context?.userId) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const documentId = typeof body?.documentId === 'string' ? body.documentId.trim() : '';
    const email = normalizeShareEmail(body?.email);
    const access = typeof body?.access === 'string' ? body.access : '';

    if (!documentId || !email || !isDocumentShareAccess(access)) {
      return NextResponse.json({ message: 'Invalid payload' }, { status: 400 });
    }

    const loaded = await loadOwnedDocumentForSharing(documentId, String(context.userId));
    if ('response' in loaded) return loaded.response;
    const { document } = loaded;

    const shares = Array.isArray(document.sharedWith)
      ? ([...document.sharedWith] as Array<Record<string, unknown>>)
      : [];
    const existingIndex = shares.findIndex((entry) => {
      const entryEmail = normalizeShareEmail(entry.email) || normalizeShareEmail(entry.contact);
      return entryEmail === email;
    });

    if (existingIndex < 0) {
      return NextResponse.json({ message: 'Shared user not found' }, { status: 404 });
    }

    const now = new Date();
    const existingShare = shares[existingIndex];
    const targetName = typeof existingShare.name === 'string' ? existingShare.name : undefined;
    const currentUser = await loadShareActor(String(context.userId));
    const issuedShareToken = issueDocumentShareToken();
    const accountInvite = await ensureDocumentShareAccountInvite({
      email,
      name: targetName,
      access: access as DocumentShareAccess,
      invitedBy: String(context.userId),
      documentId: String(document._id),
      now,
    });

    shares[existingIndex] = {
      ...existingShare,
      email,
      access,
      recipientUserId: accountInvite.userId || existingShare.recipientUserId,
      accountStatus: accountInvite.status,
      updatedAt: now,
      lastNotificationAt: now,
      accountClaimSentAt:
        accountInvite.status === 'pending'
          ? now
          : existingShare.accountClaimSentAt,
      shareTokenHash: issuedShareToken.tokenHash,
      revokedAt: undefined,
    };

    document.sharedWith = shares as typeof document.sharedWith;
    await document.save();

    let emailSent = false;
    let emailError: string | null = null;
    try {
      await sendDocumentShareEmail({
        toEmail: email,
        recipientName: targetName,
        documentName: document.documentName,
        access: access as DocumentShareAccess,
        sharedByName: currentUser.name || null,
        sharedByEmail: currentUser.email,
        shareLink: buildShareLink({
          req,
          documentId: String(document._id),
          email,
          access: access as DocumentShareAccess,
          shareToken: issuedShareToken.token,
          requiresAccountClaim: accountInvite.status === 'pending',
        }),
        requiresAccountClaim: accountInvite.status === 'pending',
      });
      emailSent = true;
    } catch (error) {
      emailError = error instanceof Error ? error.message : 'Failed to send email notification';
      console.error('Document share access update email failed', error);
    }

    return NextResponse.json({
      success: true,
      emailSent,
      emailError,
      sharedWith: serializeActiveShares(document.sharedWith),
    });
  } catch (error) {
    console.error('PATCH /api/documents/share failed', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const context = await getAuthContext(req);
    if (!context?.userId) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const documentId = typeof body?.documentId === 'string' ? body.documentId.trim() : '';
    const email = normalizeShareEmail(body?.email);
    const removeAll = body?.removeAll === true;

    if (!documentId || (!email && !removeAll)) {
      return NextResponse.json({ message: 'Invalid payload' }, { status: 400 });
    }

    const loaded = await loadOwnedDocumentForSharing(documentId, String(context.userId));
    if ('response' in loaded) return loaded.response;
    const { document } = loaded;

    const shares = Array.isArray(document.sharedWith)
      ? ([...document.sharedWith] as Array<Record<string, unknown>>)
      : [];
    const nextShares = removeAll
      ? []
      : shares.filter((entry) => {
          const entryEmail = normalizeShareEmail(entry.email) || normalizeShareEmail(entry.contact);
          return entryEmail !== email;
        });

    document.sharedWith = nextShares as typeof document.sharedWith;
    await document.save();

    return NextResponse.json({
      success: true,
      sharedWith: serializeActiveShares(document.sharedWith),
    });
  } catch (error) {
    console.error('DELETE /api/documents/share failed', error);
    return NextResponse.json({ message: 'Internal server error' }, { status: 500 });
  }
}
