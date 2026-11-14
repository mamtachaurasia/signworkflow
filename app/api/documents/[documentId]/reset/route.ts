import { NextRequest, NextResponse } from 'next/server';
import Document from '@/models/Document';
import { getUpdatedDocumentStatus } from '@/lib/statusLogic';
import { sanitizeRecipients } from '@/lib/recipient-sanitizer';
import { Recipient } from '@/types/types';
import connectDB from '@/utils/db';
import { withTrialWriteAccessFromAuthContext } from '@/lib/trial-access';

export const POST = withTrialWriteAccessFromAuthContext(async (
  _req: NextRequest,
  context: { params: Promise<{ documentId: string }> },
  authContext
) => {
  const { documentId } = await context.params; // must await since params is a Promise in Next 15

  try {
    await connectDB();
    if (!authContext?.userId || !authContext.orgId) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 }
      );
    }
    const userId = authContext.userId;
    const orgId = authContext.orgId;

    const doc = await Document.findOne({ _id: documentId, userId, orgId });

    if (!doc) {
      return NextResponse.json(
        { success: false, message: 'Document not found' },
        { status: 404 }
      );
    }
    if (doc.status === 'completed') {
      return NextResponse.json(
        { success: false, message: 'Completed documents are immutable.' },
        { status: 409 }
      );
    }

    let wasReset = false;
    doc.recipients.forEach((recipient: Recipient) => {
      if (recipient.status === 'rejected') {
        recipient.status = 'sent';
        recipient.rejectedAt = undefined;
        wasReset = true;
      }
    });

    if (!wasReset) {
      const safeDocument = {
        ...doc.toObject(),
        recipients: sanitizeRecipients(doc.recipients || []),
      };
      return NextResponse.json(
        { success: true, message: 'No recipients needed resetting.', document: safeDocument },
        { status: 200 }
      );
    }

    const newStatus = getUpdatedDocumentStatus(doc.toObject());
    doc.status = newStatus;

    const updatedDoc = await doc.save();
    const safeDocument = {
      ...updatedDoc.toObject(),
      recipients: sanitizeRecipients(updatedDoc.recipients || []),
    };

    return NextResponse.json({ success: true, document: safeDocument }, { status: 200 });
  } catch (error) {
    console.error('Error resetting document:', error);
    const message = error instanceof Error ? error.message : 'An unknown error occurred';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
});
