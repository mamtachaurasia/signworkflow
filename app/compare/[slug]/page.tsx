import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import SeoLandingPage from '@/components/marketing/SeoLandingPage';
import {
  COMPARISON_PAGES,
  getSeoLandingPage,
  getSeoLandingPagePath,
} from '@/config/seo-pages.config';

type ComparisonPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: ComparisonPageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = getSeoLandingPage('compare', slug);

  if (!page) {
    return {
      title: 'Comparison Not Found',
      alternates: {
        canonical: '/compare',
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
  return COMPARISON_PAGES.map((page) => ({
    slug: page.slug,
  }));
}

export default async function ComparisonPage({ params }: ComparisonPageProps) {
  const { slug } = await params;
  const page = getSeoLandingPage('compare', slug);

  if (!page) {
    notFound();
  }

  return <SeoLandingPage page={page} />;
}
