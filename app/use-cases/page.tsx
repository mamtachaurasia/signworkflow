import type { Metadata } from 'next';

import SeoCollectionPage from '@/components/marketing/SeoCollectionPage';
import { SEO_COLLECTIONS } from '@/config/seo-pages.config';

const collection = SEO_COLLECTIONS['use-cases'];

export const metadata: Metadata = {
  title: collection.metaTitle,
  description: collection.metaDescription,
  alternates: {
    canonical: '/use-cases',
  },
  openGraph: {
    title: collection.metaTitle,
    description: collection.metaDescription,
    url: '/use-cases',
    type: 'website',
  },
  twitter: {
    title: collection.metaTitle,
    description: collection.metaDescription,
  },
};

export default function UseCasesPage() {
  return <SeoCollectionPage group="use-cases" />;
}
