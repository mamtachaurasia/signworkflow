'use client';

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

import useContextStore from '@/hooks/useContextStore';
import { Button } from '@ui';

type AuthAwareCtaProps = {
  primaryLabel?: string;
  signedInLabel?: string;
  secondaryLabel?: string;
  secondaryHref?: string;
  surface?: 'light' | 'dark';
  ocidPrefix: string;
};

export default function AuthAwareCta({
  primaryLabel = 'Start Free Trial',
  signedInLabel = 'Go to Dashboard',
  secondaryLabel = 'Book a Demo',
  secondaryHref = '/request-demo',
  surface = 'light',
  ocidPrefix,
}: AuthAwareCtaProps) {
  const { user } = useContextStore();
  const primaryHref = user ? '/dashboard' : '/register';
  const primaryText = user ? signedInLabel : primaryLabel;
  const secondaryVariant = surface === 'dark' ? 'inverse' : 'outline';

  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <Button asChild size="lg" data-ocid={`${ocidPrefix}.primary`}>
        <Link href={primaryHref}>
          {primaryText}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </Button>
      <Button asChild size="lg" variant={secondaryVariant} data-ocid={`${ocidPrefix}.secondary`}>
        <Link href={secondaryHref}>{secondaryLabel}</Link>
      </Button>
    </div>
  );
}
