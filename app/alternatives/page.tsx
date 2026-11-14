import type { Metadata } from 'next';

import SeoCollectionPage from '@/components/marketing/SeoCollectionPage';
import { SEO_COLLECTIONS } from '@/config/seo-pages.config';

const collection = SEO_COLLECTIONS.alternatives;

export const metadata: Metadata = {
  title: collection.metaTitle,
  description: collection.metaDescription,
  alternates: {
    canonical: '/alternatives',
  },
  openGraph: {
    title: collection.metaTitle,
    description: collection.metaDescription,
    url: '/alternatives',
    type: 'website',
  },
  twitter: {
    title: collection.metaTitle,
    description: collection.metaDescription,
  },
};

export default function AlternativesPage() {
  return <SeoCollectionPage group="alternatives" />;
}
