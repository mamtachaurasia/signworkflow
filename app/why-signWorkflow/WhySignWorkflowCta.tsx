'use client';

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

import useContextStore from '@/hooks/useContextStore';
import { Button } from '@ui';

type WhySignWorkflowCtaProps = {
  surface?: 'light' | 'dark';
  ocidPrefix: string;
};

export default function WhySignWorkflowCta({
  surface = 'light',
  ocidPrefix,
}: WhySignWorkflowCtaProps) {
  const { user } = useContextStore();
  const primaryHref = user ? '/dashboard' : '/register';
  const primaryLabel = user ? 'Go to Dashboard' : 'Start Free Trial';
  const secondaryVariant = surface === 'dark' ? 'inverse' : 'outline';

  return (
    <div className="mt-8 flex flex-col gap-3 sm:flex-row">
      <Button asChild size="lg" data-ocid={`${ocidPrefix}.primary`}>
        <Link href={primaryHref}>
          {primaryLabel}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </Button>
      <Button asChild size="lg" variant={secondaryVariant} data-ocid={`${ocidPrefix}.book_demo`}>
        <Link href="/request-demo">Book a Demo</Link>
      </Button>
    </div>
  );
}
