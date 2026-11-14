'use client';

import { ArrowRight, Upload } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@ui';
import useContextStore from '@/hooks/useContextStore';

export default function MarketingHeroActions() {
  const { user } = useContextStore();
  const primaryHref = user ? '/dashboard' : '/register';
  const primaryLabel = user ? 'Go to Dashboard' : 'Free trial';
  const uploadHref = user ? '/builder' : '/login';

  return (
    <div className="my-6 flex flex-col gap-4 sm:flex-row justify-center">
      <Button asChild variant="brand" size="lg">
        <Link href={primaryHref}>
          {primaryLabel}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </Button>
      <Button asChild variant="inverse" size="lg">
        <Link href={uploadHref}>
          Upload document
          <Upload className="h-4 w-4" />
        </Link>
      </Button>
    </div>
  );
}
