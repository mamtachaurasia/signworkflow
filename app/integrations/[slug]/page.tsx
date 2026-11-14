import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import SeoLandingPage from '@/components/marketing/SeoLandingPage';
import {
  INTEGRATION_PAGES,
  getSeoLandingPage,
  getSeoLandingPagePath,
} from '@/config/seo-pages.config';

type IntegrationPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: IntegrationPageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = getSeoLandingPage('integrations', slug);

  if (!page) {
    return {
      title: 'Integration Not Found',
      alternates: {
        canonical: '/integrations',
      },
    };
  }

  const path = getSeoLandingPagePath(page);

  return {
    title: page.metaTitle,
    description: page.metaDescription,
    keywords: [page.primaryKeyword, ...page.secondaryKeywords],
    alternates: {
      canonical: path,
    },
    openGraph: {
      title: page.metaTitle,
      description: page.metaDescription,
      url: path,
      type: 'website',
    },
    twitter: {
      title: page.metaTitle,
      description: page.metaDescription,
    },
  };
}

export function generateStaticParams() {
  return INTEGRATION_PAGES.map((page) => ({
    slug: page.slug,
  }));
}

export default async function IntegrationPage({ params }: IntegrationPageProps) {
  const { slug } = await params;
  const page = getSeoLandingPage('integrations', slug);

  if (!page) {
    notFound();
  }

  return <SeoLandingPage page={page} />;
}
