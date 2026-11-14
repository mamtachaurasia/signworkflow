import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import connectDB from '@/utils/db';
import DocumentModel from '@/models/Document';
import { isAdminRole } from '@/lib/role-utils';
import { withTrialWriteAccessFromAuthContext } from '@/lib/trial-access';

export const runtime = 'nodejs';

const PaymentStatusSchema = z.object({
  status: z.enum(['pending', 'paid']),
});

type RouteContext = {
  params: Promise<{ documentId: string }>;
};

export const PATCH = withTrialWriteAccessFromAuthContext(async function PATCH(
  req: NextRequest,
  context: RouteContext,
  authContext
) {
  try {
    await connectDB();

    if (!authContext?.userId || !authContext.orgId) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const parsed = PaymentStatusSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ message: 'Invalid payment status' }, { status: 400 });
    }

    const { documentId } = await context.params;
    const document = await DocumentModel.findById(documentId);
    if (!document) {
      return NextResponse.json({ message: 'Document not found' }, { status: 404 });
    }

    const inSameWorkspace = document.orgId && String(document.orgId) === authContext.orgId;
    const isOwner = String(document.userId) === authContext.userId && inSameWorkspace;
    const isWorkspaceAdmin = inSameWorkspace && isAdminRole(authContext.orgRole);

    if (!isOwner && !isWorkspaceAdmin) {
      return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
    }

    if (!document.paymentRequest?.enabled) {
      return NextResponse.json({ message: 'No payment request is attached to this document.' }, { status: 409 });
    }

    document.paymentRequest.status = parsed.data.status;
    document.paymentRequest.paidAt = parsed.data.status === 'paid' ? new Date() : null;
    await document.save();

    return NextResponse.json({
      success: true,
      paymentRequest: document.paymentRequest,
    });
  } catch (error) {
    console.error('Payment request status route failed:', error);
    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 });
  }
});
