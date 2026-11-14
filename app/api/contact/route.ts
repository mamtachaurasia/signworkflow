import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getClientIp, isSecureRequest, withSecurityHeaders } from '@/lib/auth';
import { sendContactInquiryEmails, type ContactInquiryTopic } from '@/lib/email';
import { consumeRateLimit } from '@/lib/rateLimit';

export const runtime = 'nodejs';

const TOPIC_RECIPIENTS: Record<ContactInquiryTopic, string> = {
  general: process.env.CONTACT_EMAIL || 'contact@signworkflow.com',
  sales: process.env.SALES_EMAIL || 'sales@signworkflow.com',
  press: process.env.PRESS_EMAIL || 'press@signworkflow.com',
};

const CONTACT_TOPICS = ['sales', 'general', 'press'] as const;
const TEAM_SIZES = ['1-10', '11-50', '51-200', '200+'] as const;
const MAX_REQUEST_BODY_BYTES = 16 * 1024;

class ContactBodyTooLargeError extends Error {}

const ContactRequestSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  workEmail: z.string().trim().email().max(320),
  topic: z.enum(CONTACT_TOPICS),
  subject: z
    .string()
    .trim()
    .max(200)
    .refine(
      (value) => !/[\r\n\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(value),
      'Subject contains unsupported characters.'
    )
    .optional(),
  teamSize: z.enum(TEAM_SIZES).optional(),
  message: z.string().trim().min(1).max(5000),
  contactConfirmation: z.string().max(500).optional().default(''),
});

type ContactRateLimitInput = {
  key: string;
  namespace: 'contact:ip' | 'contact:email';
  limit: number;
  windowSeconds: number;
};

async function readBodyWithLimit(request: NextRequest, maxBytes: number): Promise<string> {
  if (!request.body) return '';

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        try {
          await reader.cancel('Contact request body exceeded the limit.');
        } catch {
          // The size response remains authoritative even if cancellation races
          // with a disconnected client.
        }
        throw new ContactBodyTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(
    chunks.map((chunk) => Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength)),
    totalBytes
  ).toString('utf8');
}

function jsonResponse(request: NextRequest, body: Record<string, unknown>, status = 200) {
  const response = NextResponse.json(body, { status });
  response.headers.set('Cache-Control', 'no-store');
  return withSecurityHeaders(request, response);
}

function successResponse(request: NextRequest) {
  return jsonResponse(request, {
    message: "Message received. We'll get back to you soon.",
  });
}

function validationMessage(error: z.ZodError): string {
  const field = error.issues[0]?.path[0];
  if (field === 'workEmail') return 'Enter a valid work email address.';
  if (field === 'topic') return 'Choose a valid contact topic.';
  if (field === 'subject') return 'Subject must be 200 characters or fewer.';
  if (field === 'teamSize') return 'Choose a valid team size.';
  if (field === 'message') return 'Message is required and must be 5000 characters or fewer.';
  if (field === 'firstName' || field === 'lastName') {
    return 'First and last name are required and must be 100 characters or fewer.';
  }
  return 'Check the form fields and try again.';
}

function tooManyRequestsResponse(request: NextRequest, retryAfterSeconds: number) {
  const response = NextResponse.json(
    { error: 'Too many contact requests. Please try again later.' },
    { status: 429 }
  );
  response.headers.set('Retry-After', String(retryAfterSeconds));
  return withSecurityHeaders(request, response);
}

function rateLimiterUnavailableResponse(request: NextRequest) {
  return jsonResponse(
    request,
    { error: 'Contact service is temporarily unavailable. Please try again later.' },
    503
  );
}

async function consumeContactRateLimit(input: ContactRateLimitInput) {
  try {
    return await consumeRateLimit({
      ...input,
      ...(process.env.NODE_ENV === 'production' ? { requireDistributed: true } : {}),
    });
  } catch (error) {
    console.error('Contact request blocked because rate limiting is unavailable:', {
      namespace: input.namespace,
      error: error instanceof Error ? error.message : 'Unknown rate-limit error',
    });
    return null;
  }
}

function emailDomain(email: string): string {
  return email.split('@')[1] || 'unknown';
}

export async function OPTIONS(request: NextRequest) {
  return withSecurityHeaders(request, new NextResponse(null, { status: 204 }));
}

export async function POST(request: NextRequest) {
  if (!isSecureRequest(request)) {
    return jsonResponse(request, { error: 'HTTPS is required.' }, 400);
  }

  const contentType = request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase();
  if (contentType !== 'application/json') {
    return jsonResponse(request, { error: 'Content-Type must be application/json.' }, 415);
  }

  const contentLength = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BODY_BYTES) {
    return jsonResponse(request, { error: 'Request body is too large.' }, 413);
  }

  const ipAddress = getClientIp(request);
  const ipLimit = await consumeContactRateLimit({
    key: ipAddress,
    namespace: 'contact:ip',
    limit: 10,
    windowSeconds: 15 * 60,
  });

  if (!ipLimit) return rateLimiterUnavailableResponse(request);
  if (!ipLimit.allowed) return tooManyRequestsResponse(request, ipLimit.retryAfterSeconds);

  let rawBody: unknown;
  try {
    const bodyText = await readBodyWithLimit(request, MAX_REQUEST_BODY_BYTES);
    rawBody = JSON.parse(bodyText) as unknown;
  } catch (error) {
    if (error instanceof ContactBodyTooLargeError) {
      return jsonResponse(request, { error: 'Request body is too large.' }, 413);
    }
    return jsonResponse(request, { error: 'Invalid JSON payload.' }, 400);
  }

  const parsed = ContactRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return jsonResponse(request, { error: validationMessage(parsed.error) }, 400);
  }

  const { firstName, lastName, topic, subject, teamSize, message, contactConfirmation } = parsed.data;
  const workEmail = parsed.data.workEmail.toLowerCase();

  // Treat a populated honeypot as accepted so bots do not learn which field
  // caused the request to be discarded.
  if (contactConfirmation.trim()) return successResponse(request);

  const emailLimit = await consumeContactRateLimit({
    key: workEmail,
    namespace: 'contact:email',
    limit: 4,
    windowSeconds: 60 * 60,
  });

  if (!emailLimit) return rateLimiterUnavailableResponse(request);
  if (!emailLimit.allowed) return tooManyRequestsResponse(request, emailLimit.retryAfterSeconds);

  const recipientEmail = TOPIC_RECIPIENTS[topic];

  try {
    await sendContactInquiryEmails({
      recipientEmail,
      firstName,
      lastName,
      workEmail,
      topic,
      subject,
      teamSize,
      message,
      userAgent: request.headers.get('user-agent'),
      ipAddress,
    });

    return successResponse(request);
  } catch (error) {
    console.error('Contact form delivery failed:', {
      topic,
      requesterDomain: emailDomain(workEmail),
      error: error instanceof Error ? error.message : 'Unknown email delivery error',
    });

    return jsonResponse(
      request,
      { error: 'We could not send your message right now. Please try again later.' },
      503
    );
  }
}
