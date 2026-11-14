import type { Document as MongooseDocument } from 'mongoose';

import type { IDocument, IDocumentRecipient } from '@/models/Document';
import { issueSigningToken, assignIssuedSigningToken } from '@/lib/signing-token';
import {
  buildEventClient,
  buildEventConsent,
  buildEventGeo,
  getNextSequentialOrder,
  isRecipientComplete,
} from '@/lib/signing-utils';
import { updateDocumentStatus } from '@/lib/statusLogic';

type SigningAction = 'signed' | 'approved' | 'rejected';

export interface SigningActionNotification {
  recipient: IDocumentRecipient;
  signingToken: string;
}

type SigningDocument = MongooseDocument & IDocument;

interface ApplySigningActionInput {
  document: SigningDocument;
  recipient: IDocumentRecipient;
  action: SigningAction;
  actionAt: Date;
  version?: number;
  baseVersion?: number;
  fields?: Array<{ fieldId: string; fieldHash: string }>;
  fieldsHash?: string;
  fieldsHashAlgo?: string;
  location?: IDocumentRecipient['location'];
  device?: IDocumentRecipient['device'];
  consent?: IDocumentRecipient['consent'];
  ip?: string;
  ipUnavailableReason?: string;
  userAgent?: string;
}

interface ApplySigningActionResult {
  nextRecipientsToNotify: SigningActionNotification[];
}

function shouldNotifyNextSequentialRecipient(recipient: IDocumentRecipient, nextOrder: number): boolean {
  if (recipient.role === 'viewer') return false;
  if (recipient.order !== nextOrder) return false;
  if (isRecipientComplete(recipient)) return false;

  return recipient.status === 'pending' || recipient.status === 'viewed' || recipient.status == null;
}

export function applySigningAction(input: ApplySigningActionInput): ApplySigningActionResult {
  const {
    document,
    recipient,
    action,
    actionAt,
    version,
    baseVersion,
    fields,
    fieldsHash,
    fieldsHashAlgo,
    location,
    device,
    consent,
    ip,
    ipUnavailableReason,
    userAgent,
  } = input;

  if (action === 'signed') {
    recipient.status = 'signed';
    recipient.signedAt = actionAt;
    recipient.rejectedAt = undefined;
    if (typeof version === 'number') {
      recipient.signedVersion = version;
    }
  } else if (action === 'approved') {
    recipient.status = 'approved';
    recipient.approvedAt = actionAt;
    recipient.rejectedAt = undefined;
  } else {
    recipient.status = 'rejected';
    recipient.rejectedAt = actionAt;
    if (recipient.role === 'signer') {
      recipient.signedAt = undefined;
    }
    if (recipient.role === 'approver') {
      recipient.approvedAt = undefined;
    }
  }

  if (location) recipient.location = location;
  if (device) recipient.device = device;
  if (consent) recipient.consent = consent;
  recipient.network = { ip, ipUnavailableReason };

  const recipients = (document.recipients ?? []) as IDocumentRecipient[];
  document.signingEvents ??= [];
  document.signingEvents.push({
    recipientId: recipient.id,
    action,
    fields,
    fieldsHash,
    fieldsHashAlgo,
    signedAt: actionAt,
    serverTimestamp: actionAt,
    baseVersion,
    version,
    order: recipient.order,
    ip,
    ipUnavailableReason,
    userAgent,
    client: buildEventClient({ ip, userAgent, recipient }),
    geo: buildEventGeo(recipient),
    consent: buildEventConsent(recipient),
  });

  updateDocumentStatus(document);
  if (document.status === 'completed') {
    document.completedAt ??= actionAt;
    document.finalizedAt ??= actionAt;
  }

  const nextRecipientsToNotify: SigningActionNotification[] = [];
  if (document.signingMode === 'sequential' && (action === 'signed' || action === 'approved')) {
    const nextOrder = getNextSequentialOrder(recipients);
    if (nextOrder !== null) {
      const nextRecipients = recipients.filter(
        (nextRecipient: IDocumentRecipient) => shouldNotifyNextSequentialRecipient(nextRecipient, nextOrder)
      );

      for (const nextRecipient of nextRecipients) {
        if (nextRecipient.status === 'pending' || nextRecipient.status == null) {
          nextRecipient.status = 'sent';
        }
        const issuedSigningToken = issueSigningToken();
        assignIssuedSigningToken(nextRecipient, issuedSigningToken);
        nextRecipientsToNotify.push({
          recipient: nextRecipient,
          signingToken: issuedSigningToken.token,
        });

        document.signingEvents.push({
          recipientId: nextRecipient.id,
          action: 'sent',
          sentAt: actionAt,
          serverTimestamp: actionAt,
          baseVersion: typeof version === 'number' ? version : baseVersion,
          targetVersion: typeof version === 'number' ? version + 1 : undefined,
          order: nextRecipient.order,
          ip,
          ipUnavailableReason,
          userAgent,
          client: buildEventClient({ ip, userAgent, recipient: nextRecipient }),
          geo: buildEventGeo(nextRecipient),
          consent: buildEventConsent(nextRecipient),
        });
      }
    }
  }

  return { nextRecipientsToNotify };
}
