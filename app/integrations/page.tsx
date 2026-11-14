import type { Metadata } from 'next';

import SeoCollectionPage from '@/components/marketing/SeoCollectionPage';
import { SEO_COLLECTIONS } from '@/config/seo-pages.config';

const collection = SEO_COLLECTIONS.integrations;

export const metadata: Metadata = {
  title: collection.metaTitle,
  description: collection.metaDescription,
  alternates: {
    canonical: '/integrations',
  },
  openGraph: {
    title: collection.metaTitle,
    description: collection.metaDescription,
    url: '/integrations',
    type: 'website',
  },
  twitter: {
    title: collection.metaTitle,
    description: collection.metaDescription,
  },
};

export default function IntegrationsPage() {
  return <SeoCollectionPage group="integrations" />;
}
