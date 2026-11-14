import { NextRequest, NextResponse } from 'next/server';

import connectDB from '@/utils/db';
import DocumentModel from '@/models/Document';
import {
  buildSigningTokenLookup,
  recipientMatchesSigningToken,
  type RecipientTokenShape,
} from '@/lib/signing-token';
import { buildEventClient, buildEventConsent, normalizeIp } from '@/lib/signing-utils';
import { ESIGN_DISCLOSURE_VERSION } from '@/lib/esign-disclosure';

export async function POST(req: NextRequest) {
  try {
    await connectDB();

    const body = (await req.json().catch(() => null)) as
      | {
          token?: string;
          accepted?: boolean;
          device?: {
            type?: 'mobile' | 'desktop' | 'tablet';
            os?: string;
            browser?: string;
            userAgent?: string;
          };
        }
      | null;

    const token = typeof body?.token === 'string' ? body.token.trim() : '';
    if (!token) {
      return NextResponse.json({ success: false, message: 'Token is required' }, { status: 400 });
    }
    if (body?.accepted !== true) {
      return NextResponse.json(
        { success: false, message: 'Electronic signature disclosure consent is required.' },
        { status: 400 }
      );
    }

    const document = await DocumentModel.findOne(buildSigningTokenLookup(token));
    if (!document) {
      return NextResponse.json(
        { success: false, message: 'Invalid or expired signing link' },
        { status: 404 }
      );
    }
    if (document.deletedAt) {
      return NextResponse.json({ success: false, message: 'Document has been trashed.' }, { status: 410 });
    }

    const recipient = document.recipients.find((candidate: RecipientTokenShape) =>
      recipientMatchesSigningToken(candidate, token)
    );
    if (!recipient) {
      return NextResponse.json({ success: false, message: 'Recipient not found' }, { status: 404 });
    }

    const alreadyAccepted = recipient.consent?.esignDisclosureAccepted === true;
    const acceptedAt = recipient.consent?.esignDisclosureAcceptedAt ?? new Date();
    recipient.consent = {
      ...recipient.consent,
      esignDisclosureAccepted: true,
      esignDisclosureAcceptedAt: acceptedAt,
      esignDisclosureVersion: recipient.consent?.esignDisclosureVersion || ESIGN_DISCLOSURE_VERSION,
      esignDisclosureMethod: 'checkbox',
    };
    if (body.device) {
      recipient.device = {
        ...recipient.device,
        ...body.device,
      };
    }

    const { ip, ipUnavailableReason } = normalizeIp(req.headers.get('x-forwarded-for'));
    const userAgent = req.headers.get('user-agent') ?? body.device?.userAgent;
    recipient.network = {
      ...(ip ? { ip } : {}),
      ...(ipUnavailableReason ? { ipUnavailableReason } : {}),
    };

    if (!alreadyAccepted) {
      document.signingEvents ??= [];
      document.signingEvents.push({
        recipientId: recipient.id,
        action: 'consent_accepted',
        serverTimestamp: acceptedAt,
        ip,
        ipUnavailableReason,
        userAgent,
        order: recipient.order,
        client: buildEventClient({ ip, userAgent, recipient }),
        consent: buildEventConsent(recipient),
      });
    }

    await document.save();

    return NextResponse.json({
      success: true,
      consent: recipient.consent,
    });
  } catch (error) {
    console.error('E-sign disclosure consent route failed:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to record disclosure consent' },
      { status: 500 }
    );
  }
}
