import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import SeoLandingPage from '@/components/marketing/SeoLandingPage';
import {
  USE_CASE_PAGES,
  getSeoLandingPage,
  getSeoLandingPagePath,
} from '@/config/seo-pages.config';

type UseCasePageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: UseCasePageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = getSeoLandingPage('use-cases', slug);

  if (!page) {
    return {
      title: 'Use Case Not Found',
      alternates: {
        canonical: '/use-cases',
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
  return USE_CASE_PAGES.map((page) => ({
    slug: page.slug,
  }));
}

export default async function UseCasePage({ params }: UseCasePageProps) {
  const { slug } = await params;
  const page = getSeoLandingPage('use-cases', slug);

  if (!page) {
    notFound();
  }

  return <SeoLandingPage page={page} />;
}
