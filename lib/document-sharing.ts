import { createHash, randomBytes } from 'crypto';

import { buildUnassignedOrgConditions } from '@/lib/workspace-scope';

export const DOCUMENT_SHARE_ACCESS_VALUES = ['can_view', 'can_send', 'can_edit'] as const;
const DOCUMENT_SHARE_TOKEN_BYTES = 32;

export type DocumentShareAccess = (typeof DOCUMENT_SHARE_ACCESS_VALUES)[number];

export type DocumentShareEntry = {
  email?: unknown;
  contact?: unknown;
  name?: unknown;
  access?: unknown;
  shareTokenHash?: unknown;
  revokedAt?: unknown;
};

const SHARE_ACCESS_RANK: Record<DocumentShareAccess, number> = {
  can_view: 1,
  can_send: 2,
  can_edit: 3,
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isDocumentShareAccess(value: unknown): value is DocumentShareAccess {
  return (
    typeof value === 'string' &&
    DOCUMENT_SHARE_ACCESS_VALUES.includes(value as DocumentShareAccess)
  );
}

export function normalizeShareEmail(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return EMAIL_PATTERN.test(normalized) ? normalized : null;
}

export function hashDocumentShareToken(token: string): string {
  const normalized = token.trim();
  if (!normalized) {
    throw new Error('Document share token is required');
  }

  const pepper = process.env.DOCUMENT_SHARE_TOKEN_PEPPER || process.env.SIGNING_TOKEN_PEPPER || '';
  return createHash('sha256').update(`${normalized}:${pepper}`).digest('hex');
}

export function issueDocumentShareToken(): { token: string; tokenHash: string } {
  const token = randomBytes(DOCUMENT_SHARE_TOKEN_BYTES).toString('hex');
  return {
    token,
    tokenHash: hashDocumentShareToken(token),
  };
}

export function documentShareAccessMeets(
  access: unknown,
  minimumAccess: DocumentShareAccess
): boolean {
  if (!isDocumentShareAccess(access)) {
    return false;
  }

  return SHARE_ACCESS_RANK[access] >= SHARE_ACCESS_RANK[minimumAccess];
}

function isActiveShare(entry: DocumentShareEntry): boolean {
  return entry.revokedAt === null || entry.revokedAt === undefined;
}

export function getDocumentShareForEmail(
  sharedWith: unknown,
  requesterEmail: unknown,
  minimumAccess: DocumentShareAccess = 'can_view'
): (DocumentShareEntry & { email: string; access: DocumentShareAccess }) | null {
  const normalizedRequesterEmail = normalizeShareEmail(requesterEmail);
  if (!normalizedRequesterEmail || !Array.isArray(sharedWith)) {
    return null;
  }

  for (const rawEntry of sharedWith) {
    const entry = (rawEntry ?? {}) as DocumentShareEntry;
    const entryEmail = normalizeShareEmail(entry.email) || normalizeShareEmail(entry.contact);
    const entryAccess = isDocumentShareAccess(entry.access) ? entry.access : null;
    if (
      entryEmail === normalizedRequesterEmail &&
      isActiveShare(entry) &&
      entryAccess &&
      documentShareAccessMeets(entryAccess, minimumAccess)
    ) {
      return {
        ...entry,
        email: entryEmail,
        access: entryAccess,
      };
    }
  }

  return null;
}

export function getDocumentShareForToken(
  sharedWith: unknown,
  shareToken: unknown,
  minimumAccess: DocumentShareAccess = 'can_view'
): (DocumentShareEntry & { email: string; access: DocumentShareAccess }) | null {
  if (typeof shareToken !== 'string' || !shareToken.trim() || !Array.isArray(sharedWith)) {
    return null;
  }

  let tokenHash: string;
  try {
    tokenHash = hashDocumentShareToken(shareToken);
  } catch {
    return null;
  }

  for (const rawEntry of sharedWith) {
    const entry = (rawEntry ?? {}) as DocumentShareEntry;
    const entryEmail = normalizeShareEmail(entry.email) || normalizeShareEmail(entry.contact);
    const entryAccess = isDocumentShareAccess(entry.access) ? entry.access : null;
    if (
      entryEmail &&
      entryAccess &&
      isActiveShare(entry) &&
      entry.shareTokenHash === tokenHash &&
      documentShareAccessMeets(entryAccess, minimumAccess)
    ) {
      return {
        ...entry,
        email: entryEmail,
        access: entryAccess,
      };
    }
  }

  return null;
}

export function hasDocumentShareAccess(args: {
  sharedWith?: unknown;
  requesterEmail?: unknown;
  minimumAccess?: DocumentShareAccess;
}): boolean {
  return Boolean(
    getDocumentShareForEmail(
      args.sharedWith,
      args.requesterEmail,
      args.minimumAccess ?? 'can_view'
    )
  );
}

export function buildSharedWithElemMatch(
  requesterEmail: unknown,
  minimumAccess: DocumentShareAccess = 'can_view'
): Record<string, unknown> | null {
  const normalizedRequesterEmail = normalizeShareEmail(requesterEmail);
  if (!normalizedRequesterEmail) {
    return null;
  }

  const allowedAccess = DOCUMENT_SHARE_ACCESS_VALUES.filter((access) =>
    documentShareAccessMeets(access, minimumAccess)
  );

  return {
    $elemMatch: {
      email: normalizedRequesterEmail,
      access: { $in: allowedAccess },
      $or: [{ revokedAt: { $exists: false } }, { revokedAt: null }],
    },
  };
}

export function buildDocumentWriteFilter(args: {
  userId: string;
  orgId?: string | null;
  userEmail?: string | null;
  documentId: string;
  minimumAccess?: DocumentShareAccess;
  extra?: Record<string, unknown>;
}): Record<string, unknown> {
  const { userId, orgId, userEmail, documentId, minimumAccess = 'can_send', extra = {} } = args;
  const ownerClause = orgId
    ? { userId, orgId }
    : { userId, $or: buildUnassignedOrgConditions('orgId') };
  const sharedWith = buildSharedWithElemMatch(userEmail, minimumAccess);
  const accessClauses: Record<string, unknown>[] = [ownerClause];

  if (sharedWith) {
    accessClauses.push({ sharedWith });
  }

  return {
    _id: documentId,
    ...extra,
    $or: accessClauses,
  };
}
