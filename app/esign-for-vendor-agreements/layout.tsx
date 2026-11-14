import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'eSignature for Vendor Agreements | SignWorkflow',
  description:
    'Route vendor agreements through review, approval, signature, and record management with SignWorkflow.',
  alternates: {
    canonical: '/esign-for-vendor-agreements',
  },
};

export default function EsignForVendorAgreementsLayout({ children }: { children: ReactNode }) {
  return children;
}
