import { NextRequest, NextResponse } from 'next/server';

import { getAuthContext } from '@/lib/auth-context';
import { withSecurityHeaders } from '@/lib/auth';
import { getPlanGateForOrgFeature } from '@/lib/subscription-server';
import { recipientMatchesSigningToken, type RecipientTokenShape } from '@/lib/signing-token';
import DocumentModel, { type IDocument } from '@/models/Document';
import type { PlanFeatureKey } from '@/lib/subscription-plans';

type WorkspaceAIAccess = {
  mode: 'workspace';
  userId: string;
  orgId: string;
};

type RecipientAIAccess = {
  mode: 'recipient';
  userId: string;
  orgId: string;
  recipientId: string | null;
};

export type AIAccessContext = WorkspaceAIAccess | RecipientAIAccess;

type ResolveAIDocumentAccessResult =
  | {
      document: IDocument;
      access: AIAccessContext;
      response?: never;
    }
  | {
      document?: never;
      access?: never;
      response: NextResponse;
    };

type ResolveRecipientAIDocumentAccessResult = ResolveAIDocumentAccessResult;

function getSigningHeaders(req: NextRequest): { token: string | null; recipientId: string | null } {
  const token = req.headers.get('X-Signing-Token')?.trim() || null;
  const recipientId = req.headers.get('X-Recipient-Id')?.trim() || null;
  return { token, recipientId };
}

export function hasSigningTokenHeader(req: NextRequest): boolean {
  return Boolean(req.headers.get('X-Signing-Token')?.trim());
}

function findTokenRecipient(
  document: IDocument,
  signingToken: string | null,
  requestedRecipientId: string | null
): (RecipientTokenShape & { id?: string }) | null {
  if (!signingToken || !Array.isArray(document.recipients)) {
    return null;
  }

  const recipients = document.recipients as Array<RecipientTokenShape & { id?: string }>;
  return (
    recipients.find((recipient) => {
      if (requestedRecipientId && recipient.id !== requestedRecipientId) {
        return false;
      }
      return recipientMatchesSigningToken(recipient, signingToken);
    }) || null
  );
}

export async function resolveAIDocumentAccess(args: {
  req: NextRequest;
  documentId: string;
  feature: PlanFeatureKey;
}): Promise<ResolveAIDocumentAccessResult> {
  const { req, documentId, feature } = args;
  const document = await DocumentModel.findById(documentId);

  if (!document) {
    return {
      response: withSecurityHeaders(
        req,
        NextResponse.json({ message: 'Document not found' }, { status: 404 })
      ),
    };
  }

  const { token, recipientId } = getSigningHeaders(req);
  const tokenRecipient = findTokenRecipient(document, token, recipientId);
  if (tokenRecipient) {
    const orgId = document.orgId ? String(document.orgId) : '';
    const planGate = await getPlanGateForOrgFeature({
      orgId,
      feature,
    });

    if (!planGate.allowed) {
      return {
        response: withSecurityHeaders(
          req,
          NextResponse.json(
            {
              message: planGate.message,
              requiredTier: planGate.requiredTier,
            },
            { status: planGate.status }
          )
        ),
      };
    }

    return {
      document,
      access: {
        mode: 'recipient',
        userId: String(document.userId),
        orgId,
        recipientId: tokenRecipient.id || recipientId,
      },
    };
  }

  const context = await getAuthContext(req);
  if (!context?.userId || !context?.orgId) {
    return {
      response: withSecurityHeaders(req, NextResponse.json({ message: 'Unauthorized' }, { status: 401 })),
    };
  }

  const planGate = await getPlanGateForOrgFeature({
    orgId: context.orgId,
    feature,
  });

  if (!planGate.allowed) {
    return {
      response: withSecurityHeaders(
        req,
        NextResponse.json(
          {
            message: planGate.message,
            requiredTier: planGate.requiredTier,
          },
          { status: planGate.status }
        )
      ),
    };
  }

  if (document.userId !== context.userId && document.orgId?.toString() !== context.orgId) {
    return {
      response: withSecurityHeaders(req, NextResponse.json({ message: 'Forbidden' }, { status: 403 })),
    };
  }

  return {
    document,
    access: {
      mode: 'workspace',
      userId: context.userId,
      orgId: context.orgId,
    },
  };
}

export async function resolveRecipientAIDocumentAccess(args: {
  req: NextRequest;
  documentId: string;
}): Promise<ResolveRecipientAIDocumentAccessResult> {
  const { req, documentId } = args;
  const document = await DocumentModel.findById(documentId);

  if (!document) {
    return {
      response: withSecurityHeaders(
        req,
        NextResponse.json({ message: 'Document not found' }, { status: 404 })
      ),
    };
  }

  const { token, recipientId } = getSigningHeaders(req);
  const tokenRecipient = findTokenRecipient(document, token, recipientId);
  if (!tokenRecipient) {
    return {
      response: withSecurityHeaders(req, NextResponse.json({ message: 'Unauthorized' }, { status: 401 })),
    };
  }

  return {
    document,
    access: {
      mode: 'recipient',
      userId: String(document.userId),
      orgId: document.orgId ? String(document.orgId) : '',
      recipientId: tokenRecipient.id || recipientId,
    },
  };
}
