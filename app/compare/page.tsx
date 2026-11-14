import type { Metadata } from 'next';

import SeoCollectionPage from '@/components/marketing/SeoCollectionPage';
import { SEO_COLLECTIONS } from '@/config/seo-pages.config';

const collection = SEO_COLLECTIONS.compare;

export const metadata: Metadata = {
  title: collection.metaTitle,
  description: collection.metaDescription,
  alternates: {
    canonical: '/compare',
  },
  openGraph: {
    title: collection.metaTitle,
    description: collection.metaDescription,
    url: '/compare',
    type: 'website',
  },
  twitter: {
    title: collection.metaTitle,
    description: collection.metaDescription,
  },
};

export default function ComparePage() {
  return <SeoCollectionPage group="compare" />;
}
