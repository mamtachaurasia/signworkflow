import type { IDocumentRecipient } from '@/models/Document';

export const ESIGN_DISCLOSURE_VERSION = '2026-04-08';

export const ESIGN_DISCLOSURE_TITLE = 'Electronic Record and Signature Disclosure';

export const ESIGN_DISCLOSURE_POINTS = [
  'You agree to review and sign this document electronically.',
  'Your electronic signature and consent will be recorded with audit details such as time, IP address, and device information.',
  'You may request a non-electronic copy from the sender if your process requires it.',
  'By continuing, you confirm you can access and retain electronic records for this transaction.',
] as const;

export function hasAcceptedEsignDisclosure(
  consent?: IDocumentRecipient['consent'] | null
): boolean {
  return Boolean(consent?.esignDisclosureAccepted);
}
