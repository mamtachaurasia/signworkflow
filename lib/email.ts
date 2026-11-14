import nodemailer, { type Transporter } from 'nodemailer';
import { IDocumentRecipient } from '@/models/Document';

interface DocumentEmailData {
  _id: string;
  documentName: string;
  recipients: IDocumentRecipient[];
  sequentialSigning?: boolean;
  signingMode?: 'parallel' | 'sequential';
  paymentRequest?: {
    enabled?: boolean;
    amount?: number;
    currency?: string;
    description?: string;
    paymentLinkUrl?: string;
    status?: 'pending' | 'paid';
  };
}

interface EmailOptions {
  subject?: string;
  message?: string;
}

type MailLikeError = {
  code?: string;
  responseCode?: number;
  response?: string;
  message?: string;
};

type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
};

type SendEmailOptions = {
  to: string;
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
  messageId?: string;
};

const EMAIL_BRAND_COLOR = '#285feb';

export type EmailProvider = 'smtp';

type PublicMailError = {
  message: string;
  code?: string;
  responseCode?: number;
};

export type EmailTransportDiagnostics = {
  provider: EmailProvider;
  smtpConfigured: boolean;
  smtp?: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    from: string;
    verified: boolean;
    fallback?: {
      port: number;
      secure: boolean;
      verified: boolean;
    };
    error?: PublicMailError;
  };
};

function isGmailHost(host: string | undefined): boolean {
  return (host ?? '').toLowerCase().includes('gmail.com');
}

function sanitizeSmtpPassword(rawPassword: string, host: string | undefined): string {
  if (!rawPassword) return rawPassword;
  // Gmail app passwords are often pasted with spaces from the Google UI.
  return isGmailHost(host) ? rawPassword.replace(/\s+/g, '') : rawPassword;
}

function resolveFromAddress(smtpHost: string | undefined, smtpUser: string | undefined): string | undefined {
  const smtpFrom = process.env.SMTP_FROM?.trim();

  if (!smtpFrom) return smtpUser || undefined;
  if (!smtpUser || !isGmailHost(smtpHost)) return smtpFrom;

  // Gmail may reject unverified "from" domains; keep display name but use SMTP user address.
  const displayNameMatch = smtpFrom.match(/^(.*)<[^>]+>\s*$/);
  const displayName = displayNameMatch?.[1]?.trim().replace(/^"|"$/g, '');
  return displayName ? `"${displayName}" <${smtpUser}>` : smtpUser;
}

function getSafeMailerErrorMessage(error: unknown): string {
  const mailError = (error ?? {}) as MailLikeError;
  const code = mailError.code?.toUpperCase();
  const responseText = (mailError.response || '').toLowerCase();

  if (code === 'EAUTH' || mailError.responseCode === 535) {
    return 'SMTP authentication failed. Verify SMTP_USER and SMTP_PASS (Gmail requires App Password).';
  }

  if (code === 'EDNS' || code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
    return 'SMTP host lookup failed. Verify SMTP_HOST and DNS/network connectivity.';
  }

  if (
    code === 'ESOCKET' ||
    code === 'ECONNECTION' ||
    code === 'ECONNREFUSED' ||
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT'
  ) {
    return 'Unable to connect to SMTP server. Verify SMTP_HOST, SMTP_PORT, SMTP_SECURE, and outbound network access.';
  }

  if (
    mailError.responseCode === 550 ||
    mailError.responseCode === 553 ||
    mailError.responseCode === 554 ||
    responseText.includes('dmarc') ||
    responseText.includes('sender') ||
    responseText.includes('from')
  ) {
    return 'Sender address rejected by SMTP provider. Use a verified SMTP_FROM or SMTP_USER.';
  }

  return mailError.message || 'Email delivery failed due to SMTP provider response.';
}

function toPublicMailError(error: unknown): PublicMailError {
  const mailError = (error ?? {}) as MailLikeError;
  return {
    message: getSafeMailerErrorMessage(error),
    code: mailError.code?.toUpperCase(),
    responseCode: mailError.responseCode,
  };
}

function getSmtpConfig(): SmtpConfig {
  const host = process.env.SMTP_HOST?.trim();
  const secure = process.env.SMTP_SECURE === 'true';
  const rawPort = process.env.SMTP_PORT?.trim();
  const port = Number(rawPort || (secure ? 465 : 587));
  const user = process.env.SMTP_USER?.trim();
  const pass = sanitizeSmtpPassword(process.env.SMTP_PASS?.trim() ?? '', host);
  const from = resolveFromAddress(host, user);

  const missing: string[] = [];
  if (!host) missing.push('SMTP_HOST');
  if (!user) missing.push('SMTP_USER');
  if (!pass) missing.push('SMTP_PASS');

  if (missing.length > 0) {
    throw new Error(`SMTP is not configured. Missing: ${missing.join(', ')}`);
  }

  if (!Number.isFinite(port) || port <= 0) {
    throw new Error('SMTP_PORT must be a valid positive number.');
  }

  if (!from) {
    throw new Error('SMTP sender is not configured. Set SMTP_FROM or SMTP_USER.');
  }

  return {
    host: host!,
    port,
    secure,
    user: user!,
    pass,
    from: from!,
  };
}

function getEmailProvider(): EmailProvider {
  return 'smtp';
}

function maskEmail(rawEmail: string): string {
  const value = rawEmail.trim();
  const atIndex = value.indexOf('@');
  if (atIndex <= 1) return '***';
  const local = value.slice(0, atIndex);
  const domain = value.slice(atIndex + 1);
  const visibleLocal = local.slice(0, Math.min(2, local.length));
  return `${visibleLocal}***@${domain || '***'}`;
}

async function verifySmtpWithConfig(config: SmtpConfig): Promise<void> {
  const transporter = createMailTransport(config);
  await transporter.verify();
}

export async function verifyEmailTransport(): Promise<EmailTransportDiagnostics> {
  const provider = getEmailProvider();

  let smtpConfig: SmtpConfig | null = null;
  try {
    smtpConfig = getSmtpConfig();
  } catch {
    smtpConfig = null;
  }

  const diagnostics: EmailTransportDiagnostics = {
    provider,
    smtpConfigured: Boolean(smtpConfig),
  };

  if (!smtpConfig) {
    return diagnostics;
  }

  diagnostics.smtp = {
    host: smtpConfig.host,
    port: smtpConfig.port,
    secure: smtpConfig.secure,
    user: maskEmail(smtpConfig.user),
    from: smtpConfig.from,
    verified: false,
  };

  try {
    await verifySmtpWithConfig(smtpConfig);
    diagnostics.smtp.verified = true;
    return diagnostics;
  } catch (primaryError) {
    diagnostics.smtp.error = toPublicMailError(primaryError);
    const fallbackConfig = isConnectionFailure(primaryError) ? getConnectionFallback(smtpConfig) : null;
    if (!fallbackConfig) {
      return diagnostics;
    }

    try {
      await verifySmtpWithConfig(fallbackConfig);
      diagnostics.smtp.verified = true;
      diagnostics.smtp.fallback = {
        port: fallbackConfig.port,
        secure: fallbackConfig.secure,
        verified: true,
      };
      diagnostics.smtp.error = undefined;
      return diagnostics;
    } catch (fallbackError) {
      diagnostics.smtp.fallback = {
        port: fallbackConfig.port,
        secure: fallbackConfig.secure,
        verified: false,
      };
      diagnostics.smtp.error = toPublicMailError(fallbackError);
      return diagnostics;
    }
  }
}

function createMailTransport(config: SmtpConfig): Transporter {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    requireTLS: !config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 20_000,
    tls: {
      minVersion: 'TLSv1.2',
      servername: config.host,
    },
  });
}

function getBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_BASE_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');

  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) return `https://${vercelUrl.replace(/\/$/, '')}`;

  return 'http://localhost:3000';
}

async function sendWithConfig(config: SmtpConfig, options: SendEmailOptions) {
  const transporter = createMailTransport(config);
  await transporter.sendMail({
    from: config.from,
    to: options.to,
    replyTo: options.replyTo,
    messageId: options.messageId,
    subject: options.subject,
    text: options.text,
    html: options.html,
  });
}

function isConnectionFailure(error: unknown): boolean {
  const mailError = (error ?? {}) as MailLikeError;
  const code = mailError.code?.toUpperCase();
  return Boolean(
    code &&
    [
      'EDNS',
      'ENOTFOUND',
      'EAI_AGAIN',
      'ESOCKET',
      'ECONNECTION',
      'ECONNREFUSED',
      'ECONNRESET',
      'ETIMEDOUT',
      'ENETUNREACH',
      'EHOSTUNREACH',
      'ENOENT',
    ].includes(code)
  );
}

function getConnectionFallback(config: SmtpConfig): SmtpConfig | null {
  if (!isGmailHost(config.host)) {
    return null;
  }

  // Some networks block implicit TLS on 465. Retry Gmail STARTTLS on 587.
  if (config.secure && config.port === 465) {
    return { ...config, port: 587, secure: false };
  }

  // If 587 is blocked, try implicit TLS on 465.
  if (!config.secure && config.port === 587) {
    return { ...config, port: 465, secure: true };
  }

  return null;
}

async function sendEmail(options: SendEmailOptions): Promise<{ success: boolean; error?: string }> {
  const primaryConfig = getSmtpConfig();

  try {
    await sendWithConfig(primaryConfig, options);
    return { success: true };
  } catch (error) {
    const fallbackConfig = isConnectionFailure(error) ? getConnectionFallback(primaryConfig) : null;
    if (fallbackConfig) {
      console.warn(
        `SMTP primary connection failed (${primaryConfig.host}:${primaryConfig.port}, secure=${primaryConfig.secure}). Retrying fallback ${fallbackConfig.host}:${fallbackConfig.port}, secure=${fallbackConfig.secure}.`
      );
      try {
        await sendWithConfig(fallbackConfig, options);
        return { success: true };
      } catch (fallbackError) {
        return { success: false, error: getSafeMailerErrorMessage(fallbackError) };
      }
    }

    return { success: false, error: getSafeMailerErrorMessage(error) };
  }
}

export async function sendSigningRequestEmail(
  recipient: IDocumentRecipient,
  document: DocumentEmailData,
  options?: EmailOptions,
  signingToken?: string,
  messageId?: string
) {
  try {
    const baseUrl = getBaseUrl();
    const signingLink = `${baseUrl}/sign/${signingToken || document._id}?recipient=${recipient.id}`;

    const defaultSubject = `Please sign: ${document.documentName}`;
    const defaultMessage = `Please review and sign the document: ${document.documentName} .`;

    const subject = options?.subject || defaultSubject;
    const messageText = options?.message || defaultMessage;
    const paymentRequest = document.paymentRequest;
    const paymentLabel =
      paymentRequest?.enabled && paymentRequest.paymentLinkUrl
        ? `${paymentRequest.currency || 'INR'} ${Number(paymentRequest.amount || 0).toLocaleString('en-IN', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`
        : null;

    let roleMessage = '';
    let actionButton = '';

    if (recipient.role === 'signer') {
      roleMessage = 'As a Signer.';
      actionButton = 'Sign Document';
    } else if (recipient.role === 'approver') {
      roleMessage = 'As a reviewer and approver.';
      actionButton = 'Review & Approve';
    } else if (recipient.role === 'viewer') {
      roleMessage = 'As a reviewer.';
      actionButton = 'View Document';
    }

    if (recipient.isCC) {
      roleMessage = 'You are receiving this as a copy for your records.';
      actionButton = 'View Document';
    }

    const htmlContent = `
          <div style="max-width: 600px; margin: 0 auto; padding: 20px; font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="background-color: ${EMAIL_BRAND_COLOR}; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1>Document Signature Request</h1>
            </div>
            <div style="background-color: #f9fafb; padding: 20px; border: 1px solid #e5e7eb;">
              <p>Hi <strong>${recipient.name}</strong>,</p>
              <p>${messageText}</p>

              <div style="background-color: #e3f2fd; padding: 15px; border-radius: 6px; margin: 20px 0;">
                <p style="margin: 0;"><strong>Document:</strong> ${document.documentName}</p>
                <p style="margin: 0;"><strong>Your Role:</strong> <span style="background-color: ${recipient.color}; color: white; padding: 4px 12px;">${recipient.isCC ? 'CC' : recipient.role.toUpperCase()}</span></p>
                <p style="margin: 0;"><strong>Status:</strong> ${recipient.status}</p>
                ${recipient.expiresAt ? `<p style="margin: 0;"><strong>Expires:</strong> ${new Date(recipient.expiresAt).toLocaleDateString()}</p>` : ''}
              </div>
              <p>
               Click the link below to proceed. ${roleMessage}
              </p>


              <div style="text-align: center; margin: 20px 0;">
                <a href="${signingLink}"
                   style="background-color: ${EMAIL_BRAND_COLOR}; color: white; padding: 12px 24px;
                          text-decoration: none; border-radius: 6px; display: inline-block;">
                  ${actionButton}
                </a>
              </div>


              <p>
                Or copy and paste this link into your browser:<br>
                <a href="${signingLink}" style="color: ${EMAIL_BRAND_COLOR}; word-break: break-all;">${signingLink}</a>
              </p>

              ${paymentRequest?.enabled && paymentRequest.paymentLinkUrl ? `
                <div style="background-color: #fff7ed; padding: 15px; border-radius: 6px; margin: 20px 0; border: 1px solid #fdba74;">
                  <p style="margin: 0 0 8px 0;"><strong>Payment request:</strong> ${paymentLabel || 'Amount attached to this signing request'}</p>
                  ${paymentRequest.description ? `<p style="margin: 0 0 12px 0;">${paymentRequest.description}</p>` : ''}
                  <a href="${paymentRequest.paymentLinkUrl}"
                     style="background-color: #ea580c; color: white; padding: 10px 18px; text-decoration: none; border-radius: 6px; display: inline-block;">
                    Review payment details
                  </a>
                </div>
              ` : ''}

              ${((document.sequentialSigning || document.signingMode === 'sequential') && recipient.order > 1) ? `
                <p style="font-size: 12px; color: #f59e0b; background-color: #fef3c7; padding: 10px; border-radius: 6px;">
                  <strong>Note:</strong> You are recipient #${recipient.order}. You may need to wait for previous signers to complete their signatures.
                </p>
              ` : ''}
            </div>
            <div style="background-color: #f3f4f6; padding: 20px; text-align: center; font-size: 12px; color: #6b7280; border-radius: 0 0 8px 8px;">
              <p style="margin: 0;">This is an automated message. Please do not reply to this email.</p>
              <p style="margin: 0;">If you have any questions, please contact the document sender.</p>
              ${recipient.sendReminders && !recipient.isCC && recipient.reminderDays ? `
              <p>
               <strong>Reminder: </strong> You will receive reminders every ${recipient.reminderDays} day${recipient.reminderDays > 1 ? 's' : ''} until this document is ${recipient.role === 'signer' ? 'signed' : 'completed'}.
              </p>
              ` : ''}
              </div>
            </div>
          `;

    const result = await sendEmail({
      to: recipient.email,
      messageId,
      subject,
      text: `${messageText}\n\nClick here to sign: ${signingLink}\n\nDocument: ${document.documentName}\nRole: ${recipient.role}\nStatus: ${recipient.status}${paymentRequest?.enabled && paymentRequest.paymentLinkUrl ? `\nPayment: ${paymentLabel || 'Payment request attached'}\nPayment link: ${paymentRequest.paymentLinkUrl}` : ''}`,
      html: htmlContent,
    });

    if (!result.success) {
      throw new Error(result.error);
    }

    console.log(`✓ Signing request email sent to ${recipient.email} for document ${document._id}`);
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unknown error occurred';
    console.error(`✗ Failed to send email to ${recipient.email}:`, message);
    throw new Error(`Failed to send signing request to ${recipient.email}. Please verify email provider settings. Error: ${message}`);
  }
}

export async function sendSigningRejectedEmail(
  toEmail: string,
  documentName: string,
  rejectedBy: IDocumentRecipient
) {
  try {
    const subject = `Signing request rejected: ${documentName}`;
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #dc2626; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1>Signing Request Rejected</h1>
        </div>
        <div style="background-color: #f9fafb; padding: 20px; border: 1px solid #e5e7eb;">
          <p><strong>${rejectedBy.name || 'A recipient'}</strong> rejected the signing request for:</p>
          <p><strong>${documentName}</strong></p>
          <p>You can create a new signing request if changes are needed.</p>
        </div>
        <div style="background-color: #f3f4f6; padding: 16px; text-align: center; font-size: 12px; color: #6b7280; border-radius: 0 0 8px 8px;">
          <p style="margin: 0;">This is an automated message. Please do not reply.</p>
        </div>
      </div>
    `;

    const result = await sendEmail({
      to: toEmail,
      subject,
      text: `A recipient rejected the signing request for "${documentName}".`,
      html: htmlContent,
    });

    if (!result.success) {
      throw new Error(result.error);
    }

    console.log(`✓ Rejection email sent to ${toEmail}`);
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unknown error occurred';
    console.error(`✗ Failed to send rejection email to ${toEmail}:`, message);
    throw new Error(`Failed to send rejection email. Error: ${message}`);
  }
}

type OwnerDocumentEvent = 'viewed' | 'signed' | 'completed';

export async function sendOwnerDocumentEventEmail(params: {
  toEmail: string;
  documentName: string;
  event: OwnerDocumentEvent;
  recipient?: Pick<IDocumentRecipient, 'name' | 'email' | 'role'>;
}) {
  const { toEmail, documentName, event, recipient } = params;
  try {
    const recipientName = recipient?.name || recipient?.email || 'A recipient';
    const recipientRole = recipient?.role ? recipient.role.toUpperCase() : 'RECIPIENT';
    const actionLabel =
      event === 'signed'
        ? recipient?.role === 'approver'
          ? 'approved'
          : 'signed'
        : event === 'viewed'
          ? 'viewed'
          : 'completed';
    const heading =
      event === 'viewed'
        ? 'Document Viewed'
        : event === 'completed'
          ? 'Document Completed'
          : actionLabel === 'approved'
            ? 'Document Approved'
            : 'Document Signed';
    const subject =
      event === 'viewed'
        ? `Document viewed: ${documentName}`
        : event === 'completed'
          ? `Document completed: ${documentName}`
          : `Document ${actionLabel}: ${documentName}`;
    const timestamp = new Date().toUTCString();

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: ${EMAIL_BRAND_COLOR}; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1>${heading}</h1>
        </div>
        <div style="background-color: #f9fafb; padding: 20px; border: 1px solid #e5e7eb;">
          <p><strong>${recipientName}</strong> has ${actionLabel} the document:</p>
          <p><strong>${documentName}</strong></p>
          <p><strong>Role:</strong> ${recipientRole}</p>
          <p><strong>Time:</strong> ${timestamp}</p>
        </div>
        <div style="background-color: #f3f4f6; padding: 16px; text-align: center; font-size: 12px; color: #6b7280; border-radius: 0 0 8px 8px;">
          <p style="margin: 0;">This is an automated message. Please do not reply.</p>
        </div>
      </div>
    `;

    const result = await sendEmail({
      to: toEmail,
      subject,
      text: `${recipientName} has ${actionLabel} "${documentName}" (${recipientRole}). Time: ${timestamp}.`,
      html: htmlContent,
    });

    if (!result.success) {
      throw new Error(result.error);
    }

    console.log(`✓ Owner ${event} email sent to ${toEmail}`);
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unknown error occurred';
    console.error(`✗ Failed to send owner ${event} email to ${toEmail}:`, message);
    throw new Error(`Failed to send owner ${event} email. Error: ${message}`);
  }
}

const DOCUMENT_SHARE_ACCESS_COPY: Record<
  'can_view' | 'can_send' | 'can_edit',
  { label: string; description: string }
> = {
  can_view: {
    label: 'Can View',
    description: 'view, download, and make copies of the document',
  },
  can_send: {
    label: 'Can Send',
    description: 'view, download, invite others to sign, and manage document invites',
  },
  can_edit: {
    label: 'Can Edit',
    description: 'edit, download, invite others to sign, and manage document invites',
  },
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
// api/contact
export type ContactInquiryTopic = 'sales' | 'general' | 'press';

export type ContactInquiryEmailInput = {
  recipientEmail: string;
  firstName: string;
  lastName: string;
  workEmail: string;
  topic: ContactInquiryTopic;
  subject?: string | null;
  teamSize?: string | null;
  message: string;
  userAgent?: string | null;
  ipAddress?: string | null;
};

function getContactTopicLabel(topic: ContactInquiryTopic): string {
  switch (topic) {
    case 'sales':
      return 'Sales & workspace planning';
    case 'press':
      return 'Media & press';
    case 'general':
    default:
      return 'General inquiry';
  }
}

export async function sendContactInquiryEmails(input: ContactInquiryEmailInput) {
  const fullName = `${input.firstName} ${input.lastName}`.trim();
  const topicLabel = getContactTopicLabel(input.topic);
  const inquirySubject = input.subject?.trim() || topicLabel;
  const teamSize = input.teamSize?.trim() || 'Not specified';
  const submittedAt = new Date().toUTCString();
  const userAgent = input.userAgent?.trim() || 'Unknown';
  const ipAddress = input.ipAddress?.trim() || 'Unknown';
  const safeSubjectName = fullName.replace(/[\r\n\u2028\u2029]+/g, ' ');

  const internalText = [
    'New Contact Form Submission',
    '',
    `Name: ${fullName}`,
    `Email: ${input.workEmail}`,
    `Topic: ${topicLabel}`,
    `Subject: ${inquirySubject}`,
    `Team Size: ${teamSize}`,
    `Submitted: ${submittedAt}`,
    `IP Address: ${ipAddress}`,
    `User Agent: ${userAgent}`,
    '',
    'Message:',
    input.message,
    '',
    'Reply directly to this email to respond to the sender.',
  ].join('\n');

  const internalHtml = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #0f172a; max-width: 680px; margin: 0 auto; padding: 20px;">
      <div style="background-color: ${EMAIL_BRAND_COLOR}; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
        <h1 style="margin: 0; font-size: 22px;">New contact form submission</h1>
      </div>
      <div style="background-color: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; border-top: none;">
        <p><strong>Name:</strong> ${escapeHtml(fullName)}</p>
        <p><strong>Email:</strong> ${escapeHtml(input.workEmail)}</p>
        <p><strong>Topic:</strong> ${escapeHtml(topicLabel)}</p>
        <p><strong>Subject:</strong> ${escapeHtml(inquirySubject)}</p>
        <p><strong>Team size:</strong> ${escapeHtml(teamSize)}</p>
        <p><strong>Submitted:</strong> ${escapeHtml(submittedAt)}</p>
        <div style="margin: 20px 0; padding: 16px; background-color: white; border-left: 4px solid ${EMAIL_BRAND_COLOR};">
          <p style="margin-top: 0;"><strong>Message</strong></p>
          <p style="white-space: pre-wrap; margin-bottom: 0;">${escapeHtml(input.message)}</p>
        </div>
        <p style="font-size: 12px; color: #64748b;"><strong>IP:</strong> ${escapeHtml(ipAddress)}</p>
        <p style="font-size: 12px; color: #64748b;"><strong>User agent:</strong> ${escapeHtml(userAgent)}</p>
      </div>
    </div>
  `;

  const confirmationText = [
    `Hi ${input.firstName},`,
    '',
    'Thank you for reaching out to SignWorkflow. We received your message and will get back to you soon.',
    '',
    `Topic: ${topicLabel}`,
    `Subject: ${inquirySubject}`,
    '',
    'Best regards,',
    'The SignWorkflow Team',
  ].join('\n');

  const confirmationHtml = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #0f172a; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background-color: ${EMAIL_BRAND_COLOR}; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
        <h1 style="margin: 0; font-size: 22px;">We received your message</h1>
      </div>
      <div style="background-color: #f8fafc; padding: 20px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 8px 8px;">
        <p>Hi ${escapeHtml(input.firstName)},</p>
        <p>Thank you for reaching out to SignWorkflow. We received your message and will get back to you soon.</p>
        <p><strong>Topic:</strong> ${escapeHtml(topicLabel)}</p>
        <p><strong>Subject:</strong> ${escapeHtml(inquirySubject)}</p>
        <p style="margin-bottom: 0;">Best regards,<br />The SignWorkflow Team</p>
      </div>
    </div>
  `;

  const internalResult = await sendEmail({
    to: input.recipientEmail,
    replyTo: input.workEmail,
    subject: `New ${topicLabel} inquiry from ${safeSubjectName}`,
    text: internalText,
    html: internalHtml,
  });

  if (!internalResult.success) {
    throw new Error(internalResult.error);
  }

  const confirmationResult = await sendEmail({
    to: input.workEmail,
    replyTo: input.recipientEmail,
    subject: 'We received your message',
    text: confirmationText,
    html: confirmationHtml,
  });

  if (!confirmationResult.success) {
    console.error('Contact inquiry acknowledgement failed:', {
      requesterDomain: input.workEmail.split('@')[1] || 'unknown',
      error: confirmationResult.error,
    });
    return { success: true, confirmationSent: false };
  }

  return { success: true, confirmationSent: true };
}
/** end api/contact **/

export async function sendDocumentShareEmail(params: {
  toEmail: string;
  recipientName?: string | null;
  documentName: string;
  access: 'can_view' | 'can_send' | 'can_edit';
  sharedByName?: string | null;
  sharedByEmail?: string | null;
  shareLink: string;
  requiresAccountClaim?: boolean;
}) {
  const {
    toEmail,
    recipientName,
    documentName,
    access,
    sharedByName,
    sharedByEmail,
    shareLink,
    requiresAccountClaim = false,
  } = params;

  try {
    const accessCopy = DOCUMENT_SHARE_ACCESS_COPY[access] ?? DOCUMENT_SHARE_ACCESS_COPY.can_view;
    const senderLabel = sharedByName || sharedByEmail || 'A SignWorkflow user';
    const greetingName = recipientName?.trim() || toEmail;
    const safeGreetingName = escapeHtml(greetingName);
    const safeDocumentName = escapeHtml(documentName);
    const safeSenderLabel = escapeHtml(senderLabel);
    const safeAccessLabel = escapeHtml(accessCopy.label);
    const safeDescription = escapeHtml(accessCopy.description);
    const safeShareLink = escapeHtml(shareLink);
    const actionLabel = requiresAccountClaim ? 'Create account and open document' : 'Open Document';
    const safeActionLabel = escapeHtml(actionLabel);
    const accountInstruction = requiresAccountClaim
      ? `Create your password for ${escapeHtml(toEmail)} to unlock ${safeAccessLabel} access.`
      : `Sign in with ${escapeHtml(toEmail)} to access this shared document.`;

    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: ${EMAIL_BRAND_COLOR}; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1>Document Shared With You</h1>
        </div>
        <div style="background-color: #f9fafb; padding: 20px; border: 1px solid #e5e7eb;">
          <p>Hi <strong>${safeGreetingName}</strong>,</p>
          <p><strong>${safeSenderLabel}</strong> shared a document with you.</p>
          <div style="background-color: #e3f2fd; padding: 15px; border-radius: 6px; margin: 20px 0;">
            <p style="margin: 0;"><strong>Document:</strong> ${safeDocumentName}</p>
            <p style="margin: 0;"><strong>Access:</strong> ${safeAccessLabel}</p>
            <p style="margin: 8px 0 0 0;">You can ${safeDescription}.</p>
          </div>
          <div style="text-align: center; margin: 20px 0;">
            <a href="${safeShareLink}"
               style="background-color: ${EMAIL_BRAND_COLOR}; color: white; padding: 12px 24px;
                      text-decoration: none; border-radius: 6px; display: inline-block;">
              ${safeActionLabel}
            </a>
          </div>
          <p>
            Or copy and paste this link into your browser:<br>
            <a href="${safeShareLink}" style="color: ${EMAIL_BRAND_COLOR}; word-break: break-all;">${safeShareLink}</a>
          </p>
          <p style="font-size: 13px; color: #6b7280;">${accountInstruction}</p>
        </div>
        <div style="background-color: #f3f4f6; padding: 16px; text-align: center; font-size: 12px; color: #6b7280; border-radius: 0 0 8px 8px;">
          <p style="margin: 0;">This is an automated message. Please do not reply to this email.</p>
        </div>
      </div>
    `;

    const result = await sendEmail({
      to: toEmail,
      subject: `${senderLabel} shared "${documentName}" with you`,
      text: `${senderLabel} shared "${documentName}" with you. Access: ${accessCopy.label}. ${requiresAccountClaim ? 'Create your password to unlock this access' : 'Open it'} here: ${shareLink}`,
      html,
    });

    if (!result.success) {
      throw new Error(result.error);
    }

    console.log(`✓ Document share email sent to ${toEmail}`);
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unknown error occurred';
    console.error(`✗ Failed to send document share email to ${toEmail}:`, message);
    throw new Error(`Failed to send document share email to ${toEmail}. Error: ${message}`);
  }
}

export async function sendLoginAlertEmail(params: {
  toEmail: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  deviceInfo?: string | null;
  timestamp?: Date;
}) {
  const { toEmail, ipAddress, userAgent, deviceInfo, timestamp } = params;
  try {
    const when = (timestamp || new Date()).toUTCString();
    const deviceLabel = deviceInfo && deviceInfo.trim() ? deviceInfo : 'Unknown device';
    const agentLabel = userAgent && userAgent.trim() ? userAgent : 'Unknown browser';
    const ipLabel = ipAddress && ipAddress.trim() ? ipAddress : 'Unknown IP';
    const baseUrl = getBaseUrl();
    const settingsLink = `${baseUrl}/dashboard/account/settings`;

    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #0f172a; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1>New Login Detected</h1>
        </div>
        <div style="background-color: #f9fafb; padding: 20px; border: 1px solid #e5e7eb;">
          <p>We noticed a new sign-in to your account.</p>
          <p><strong>Time:</strong> ${when}</p>
          <p><strong>Device:</strong> ${deviceLabel}</p>
          <p><strong>Browser:</strong> ${agentLabel}</p>
          <p><strong>IP Address:</strong> ${ipLabel}</p>
          <p>If this wasn&apos;t you, reset your password and review your security settings.</p>
          <p>
            <a href="${settingsLink}" style="color: ${EMAIL_BRAND_COLOR}; word-break: break-all;">Review account security</a>
          </p>
        </div>
        <div style="background-color: #f3f4f6; padding: 16px; text-align: center; font-size: 12px; color: #6b7280; border-radius: 0 0 8px 8px;">
          <p style="margin: 0;">This is an automated message. Please do not reply.</p>
        </div>
      </div>
    `;

    const result = await sendEmail({
      to: toEmail,
      subject: 'New login to your account',
      text: `New login detected. Time: ${when}. Device: ${deviceLabel}. Browser: ${agentLabel}. IP: ${ipLabel}. Review security: ${settingsLink}`,
      html,
    });

    if (!result.success) {
      throw new Error(result.error);
    }

    console.log(`✓ Login alert email sent to ${toEmail}`);
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unknown error occurred';
    console.error(`✗ Failed to send login alert to ${toEmail}:`, message);
    throw new Error(`Failed to send login alert. Error: ${message}`);
  }
}

type SecurityLifecycleEmailInput = {
  heading: string;
  bannerColor: string;
  body: string;
  details: Array<{ label: string; value: string }>;
  actionText: string;
  actionUrl: string;
};

function getRequestSecurityLabels(params: {
  ipAddress?: string | null;
  userAgent?: string | null;
}): { ipLabel: string; agentLabel: string } {
  return {
    ipLabel: params.ipAddress && params.ipAddress.trim() ? params.ipAddress : 'Unknown IP',
    agentLabel: params.userAgent && params.userAgent.trim() ? params.userAgent : 'Unknown browser',
  };
}

function renderSecurityLifecycleEmail(input: SecurityLifecycleEmailInput): string {
  const detailsHtml = input.details
    .map((detail) => `<p><strong>${escapeHtml(detail.label)}:</strong> ${escapeHtml(detail.value)}</p>`)
    .join('');
  const safeActionUrl = escapeHtml(input.actionUrl);

  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background-color: ${escapeHtml(input.bannerColor)}; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
        <h1>${escapeHtml(input.heading)}</h1>
      </div>
      <div style="background-color: #f9fafb; padding: 20px; border: 1px solid #e5e7eb;">
        <p>${escapeHtml(input.body)}</p>
        ${detailsHtml}
        <p>If this was not you, review your account security or contact support immediately.</p>
        <p>
          <a href="${safeActionUrl}" style="color: ${EMAIL_BRAND_COLOR}; word-break: break-all;">${escapeHtml(input.actionText)}</a>
        </p>
      </div>
      <div style="background-color: #f3f4f6; padding: 16px; text-align: center; font-size: 12px; color: #6b7280; border-radius: 0 0 8px 8px;">
        <p style="margin: 0;">This is an automated security message. Please do not reply.</p>
      </div>
    </div>
  `;
}

export async function sendAccountDeletionScheduledEmail(params: {
  toEmail: string;
  deletionScheduledAt: Date;
  ipAddress?: string | null;
  userAgent?: string | null;
  timestamp?: Date;
}) {
  const { toEmail, deletionScheduledAt, ipAddress, userAgent, timestamp } = params;
  try {
    const requestedAt = (timestamp || new Date()).toUTCString();
    const scheduledAt = deletionScheduledAt.toUTCString();
    const { ipLabel, agentLabel } = getRequestSecurityLabels({ ipAddress, userAgent });
    const baseUrl = getBaseUrl();
    const loginLink = `${baseUrl}/login?email=${encodeURIComponent(toEmail)}`;
    const text = `Your account deletion request has been accepted. Requested at: ${requestedAt}. Scheduled permanent deletion: ${scheduledAt}. Browser: ${agentLabel}. IP: ${ipLabel}. If this was not you, restore your account before the scheduled deletion date: ${loginLink}`;
    const html = renderSecurityLifecycleEmail({
      heading: 'Account Deletion Scheduled',
      bannerColor: '#991b1b',
      body: 'Your account deletion request has been accepted and access is being revoked.',
      details: [
        { label: 'Requested at', value: requestedAt },
        { label: 'Scheduled permanent deletion', value: scheduledAt },
        { label: 'Browser', value: agentLabel },
        { label: 'IP Address', value: ipLabel },
      ],
      actionText: 'Restore account',
      actionUrl: loginLink,
    });

    const result = await sendEmail({
      to: toEmail,
      subject: 'Account deletion scheduled',
      text,
      html,
    });

    if (!result.success) {
      throw new Error(result.error);
    }

    console.log(`✓ Account deletion scheduled email sent to ${toEmail}`);
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unknown error occurred';
    console.error(`✗ Failed to send account deletion scheduled email to ${toEmail}:`, message);
    throw new Error(`Failed to send account deletion scheduled email. Error: ${message}`);
  }
}

export async function sendAccountRestoredEmail(params: {
  toEmail: string;
  provider?: 'password' | 'google';
  ipAddress?: string | null;
  userAgent?: string | null;
  timestamp?: Date;
}) {
  const { toEmail, provider, ipAddress, userAgent, timestamp } = params;
  try {
    const restoredAt = (timestamp || new Date()).toUTCString();
    const methodLabel = provider === 'google' ? 'Google sign-in' : 'password sign-in';
    const { ipLabel, agentLabel } = getRequestSecurityLabels({ ipAddress, userAgent });
    const baseUrl = getBaseUrl();
    const settingsLink = `${baseUrl}/dashboard/account/settings`;
    const text = `Your account has been restored and deletion has been cancelled. Restored at: ${restoredAt}. Method: ${methodLabel}. Browser: ${agentLabel}. IP: ${ipLabel}. Review security: ${settingsLink}`;
    const html = renderSecurityLifecycleEmail({
      heading: 'Account Restored',
      bannerColor: '#047857',
      body: 'Your account has been restored and deletion has been cancelled.',
      details: [
        { label: 'Restored at', value: restoredAt },
        { label: 'Verification method', value: methodLabel },
        { label: 'Browser', value: agentLabel },
        { label: 'IP Address', value: ipLabel },
      ],
      actionText: 'Review account security',
      actionUrl: settingsLink,
    });

    const result = await sendEmail({
      to: toEmail,
      subject: 'Account restored',
      text,
      html,
    });

    if (!result.success) {
      throw new Error(result.error);
    }

    console.log(`✓ Account restored email sent to ${toEmail}`);
    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'An unknown error occurred';
    console.error(`✗ Failed to send account restored email to ${toEmail}:`, message);
    throw new Error(`Failed to send account restored email. Error: ${message}`);
  }
}

export async function sendPasswordResetEmail(email: string, resetLink: string) {
  try {
    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: ${EMAIL_BRAND_COLOR}; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1>Password Reset Request</h1>
        </div>
        <div style="background-color: #f9fafb; padding: 20px; border: 1px solid #e5e7eb;">
          <p>You requested a password reset.</p>
          <p>
            Click below to reset your password:
            <br />
            <a href="${resetLink}" style="color: ${EMAIL_BRAND_COLOR}; word-break: break-all;">${resetLink}</a>
          </p>
          <p>If you did not request this change, you can ignore this email.</p>
        </div>
      </div>
    `;

    const result = await sendEmail({
      to: email,
      subject: 'Password Reset Request',
      text: `You requested a password reset. Click the link to reset your password: ${resetLink}`,
      html,
    });

    return { success: result.success, error: result.error };
  } catch (error) {
    throw new Error(getSafeMailerErrorMessage(error));
  }
}

export async function sendUserInviteEmail(email: string, inviteLink: string, role?: string) {
  try {
    const roleLabel = role ? role.toUpperCase() : 'USER';
    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: ${EMAIL_BRAND_COLOR}; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1>You&apos;re invited</h1>
        </div>
        <div style="background-color: #f9fafb; padding: 20px; border: 1px solid #e5e7eb;">
          <p>You&apos;ve been invited to join Contract eSign as <strong>${roleLabel}</strong>.</p>
          <p>
            Set your password to get started:
            <br />
            <a href="${inviteLink}" style="color: ${EMAIL_BRAND_COLOR}; word-break: break-all;">${inviteLink}</a>
          </p>
          <p>If you were not expecting this invite, you can ignore this email.</p>
        </div>
      </div>
    `;

    const result = await sendEmail({
      to: email,
      subject: "You're invited to Contract eSign",
      text: `You've been invited to join Contract eSign as ${roleLabel}. Set your password: ${inviteLink}`,
      html,
    });

    return { success: result.success, error: result.error };
  } catch (error) {
    throw new Error(getSafeMailerErrorMessage(error));
  }
}

export async function sendOrgAddedEmail(email: string, loginLink: string, role?: string) {
  try {
    const roleLabel = role ? role.toUpperCase() : 'USER';
    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: ${EMAIL_BRAND_COLOR}; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1>You've been added</h1>
        </div>
        <div style="background-color: #f9fafb; padding: 20px; border: 1px solid #e5e7eb;">
          <p>You&apos;ve been added to a workspace as <strong>${roleLabel}</strong>.</p>
          <p>
            Log in to access your account:
            <br />
            <a href="${loginLink}" style="color: ${EMAIL_BRAND_COLOR}; word-break: break-all;">${loginLink}</a>
          </p>
          <p>If you were not expecting this, please contact your administrator.</p>
        </div>
      </div>
    `;

    const result = await sendEmail({
      to: email,
      subject: "You've been added to Contract eSign",
      text: `You've been added to a workspace as ${roleLabel}. Log in: ${loginLink}`,
      html,
    });

    return { success: result.success, error: result.error };
  } catch (error) {
    throw new Error(getSafeMailerErrorMessage(error));
  }
}

export async function sendSubscriptionPlanChangedEmail(params: {
  email: string;
  recipientName?: string | null;
  workspaceName?: string | null;
  planLabel: string;
  billingCycle?: 'monthly' | 'annually' | null;
}) {
  const recipientName = params.recipientName?.trim();
  const workspaceName = params.workspaceName?.trim();
  const billingCycleLabel =
    params.billingCycle === 'monthly'
      ? 'monthly'
      : params.billingCycle === 'annually'
        ? 'annual'
        : null;
  const manageLink = `${getBaseUrl()}/dashboard/account/subscription`;
  const greeting = recipientName ? `Hi ${recipientName},` : 'Hello,';
  const workspaceLine = workspaceName
    ? `Workspace: ${workspaceName}`
    : 'Your account now has access to the upgraded workspace features.';
  const billingLine = billingCycleLabel
    ? `Billing cycle: ${billingCycleLabel}`
    : 'Billing cycle details are available on your Subscription page.';

  try {
    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #0f172a; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #0f172a 0%, #0f766e 100%); color: white; padding: 24px; border-radius: 12px 12px 0 0;">
          <h1 style="margin: 0; font-size: 24px;">Your plan is now ${params.planLabel}</h1>
        </div>
        <div style="background-color: #f8fafc; padding: 24px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
          <p style="margin-top: 0;">${greeting}</p>
          <p>Your SignWorkflow subscription upgrade has been applied successfully.</p>
          <p><strong>${workspaceLine}</strong></p>
          <p><strong>${billingLine}</strong></p>
          <p>
            You can review your package details, billing status, and available owner actions here:
            <br />
            <a href="${manageLink}" style="color: #0f766e; word-break: break-all;">${manageLink}</a>
          </p>
          <p style="margin-bottom: 0;">If you did not expect this plan change, please review your billing settings immediately.</p>
        </div>
      </div>
    `;

    const text = [
      greeting,
      '',
      `Your SignWorkflow subscription upgrade has been applied successfully.`,
      workspaceLine,
      billingLine,
      '',
      `Review billing details: ${manageLink}`,
    ].join('\n');

    const result = await sendEmail({
      to: params.email,
      subject: `Your SignWorkflow plan is now ${params.planLabel}`,
      text,
      html,
    });

    return { success: result.success, error: result.error };
  } catch (error) {
    throw new Error(getSafeMailerErrorMessage(error));
  }
}

export async function sendTrialExpirationEmail(params: {
  email: string;
  messageId: string;
  recipientName?: string | null;
  workspaceName: string;
  trialEndsAt: Date | string;
}) {
  const recipientName = params.recipientName?.trim();
  const workspaceName = params.workspaceName.trim();
  const greeting = recipientName ? `Hi ${recipientName},` : 'Hello,';
  const trialEndDate = new Date(params.trialEndsAt);
  const formattedEndDate = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(trialEndDate);
  const subscriptionLink = `${getBaseUrl()}/dashboard/account/subscription`;

  try {
    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #0f172a; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #0f172a 0%, #7c3aed 100%); color: white; padding: 24px; border-radius: 12px 12px 0 0;">
          <h1 style="margin: 0; font-size: 24px;">Your free trial has ended</h1>
        </div>
        <div style="background-color: #f8fafc; padding: 24px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 12px 12px;">
          <p style="margin-top: 0;">${escapeHtml(greeting)}</p>
          <p>The free trial for <strong>${escapeHtml(workspaceName)}</strong> ended on ${escapeHtml(formattedEndDate)}.</p>
          <p>Choose a plan to restore full workspace access, including creating, editing, and sending documents.</p>
          <p><a href="${escapeHtml(subscriptionLink)}" style="display: inline-block; background: #7c3aed; color: #ffffff; padding: 12px 18px; border-radius: 6px; text-decoration: none; font-weight: bold;">Choose a plan</a></p>
          <p style="margin-bottom: 0;">You can continue to review existing records and perform cleanup actions. If you need help, please contact our support team.</p>
        </div>
      </div>
    `;
    const text = [
      greeting,
      '',
      `The free trial for ${workspaceName} ended on ${formattedEndDate}.`,
      'Choose a plan to restore full workspace access, including creating, editing, and sending documents.',
      '',
      `Choose a plan: ${subscriptionLink}`,
      '',
      'You can continue to review existing records and perform cleanup actions.',
    ].join('\n');

    return await sendEmail({
      to: params.email,
      messageId: params.messageId,
      subject: 'Your SignWorkflow free trial has ended',
      text,
      html,
    });
  } catch (error) {
    throw new Error(getSafeMailerErrorMessage(error));
  }
}
