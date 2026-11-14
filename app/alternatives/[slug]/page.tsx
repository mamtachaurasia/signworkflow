import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import SeoLandingPage from '@/components/marketing/SeoLandingPage';
import {
  ALTERNATIVE_PAGES,
  getSeoLandingPage,
  getSeoLandingPagePath,
} from '@/config/seo-pages.config';

type AlternativePageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: AlternativePageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = getSeoLandingPage('alternatives', slug);

  if (!page) {
    return {
      title: 'Alternative Not Found',
      alternates: {
        canonical: '/alternatives',
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
  return ALTERNATIVE_PAGES.map((page) => ({
    slug: page.slug,
  }));
}

export default async function AlternativePage({ params }: AlternativePageProps) {
  const { slug } = await params;
  const page = getSeoLandingPage('alternatives', slug);

  if (!page) {
    notFound();
  }

  return <SeoLandingPage page={page} />;
}
