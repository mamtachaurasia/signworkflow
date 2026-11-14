import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';
import { INDUSTRIES } from '@/config/solutions.config';
import { SEO_LANDING_PAGES, getSeoLandingPagePath } from '@/config/seo-pages.config';
import { posts } from '@/lib/blog';

const baseUrl = SITE_URL.replace(/\/$/, '');

type SitemapRoute = {
  path: string;
  changeFrequency: NonNullable<MetadataRoute.Sitemap[number]['changeFrequency']>;
  priority: number;
  lastModified?: Date;
};

const publicRoutes: SitemapRoute[] = [
  { path: '/', changeFrequency: 'weekly' as const, priority: 1.0 },
  { path: '/about', changeFrequency: 'monthly' as const, priority: 0.8 },
  { path: '/why-signWorkflow', changeFrequency: 'monthly' as const, priority: 0.8 },
  { path: '/solutions', changeFrequency: 'monthly' as const, priority: 0.8 },
  { path: '/solutions/by-industry', changeFrequency: 'monthly' as const, priority: 0.75 },
  { path: '/use-cases', changeFrequency: 'weekly' as const, priority: 0.9 },
  { path: '/integrations', changeFrequency: 'weekly' as const, priority: 0.85 },
  { path: '/alternatives', changeFrequency: 'weekly' as const, priority: 0.9 },
  { path: '/compare', changeFrequency: 'weekly' as const, priority: 0.85 },
  { path: '/esign-for-hr', changeFrequency: 'monthly' as const, priority: 0.9 },
  { path: '/esign-for-vendor-agreements', changeFrequency: 'monthly' as const, priority: 0.9 },
  { path: '/pricing', changeFrequency: 'weekly' as const, priority: 0.95 },
  { path: '/request-demo', changeFrequency: 'weekly' as const, priority: 0.85 },
  { path: '/templates', changeFrequency: 'weekly' as const, priority: 0.8 },
  { path: '/blog', changeFrequency: 'weekly' as const, priority: 0.8 },
  { path: '/contact', changeFrequency: 'monthly' as const, priority: 0.7 },
  { path: '/trust', changeFrequency: 'monthly' as const, priority: 0.75 },
  { path: '/security', changeFrequency: 'monthly' as const, priority: 0.7 },
  { path: '/privacy', changeFrequency: 'yearly' as const, priority: 0.5 },
  { path: '/terms', changeFrequency: 'yearly' as const, priority: 0.5 },
  { path: '/cookies', changeFrequency: 'yearly' as const, priority: 0.4 },
];

const industryRoutes: SitemapRoute[] = INDUSTRIES.map((industry) => ({
  path: `/solutions/by-industry/${industry.slug}`,
  changeFrequency: 'monthly' as const,
  priority: 0.65,
}));

const blogRoutes: SitemapRoute[] = posts.map((post) => ({
  path: `/blog/${post.slug}`,
  changeFrequency: 'monthly' as const,
  priority: 0.7,
  lastModified: post.date ? new Date(post.date) : undefined,
}));

const seoLandingRoutes: SitemapRoute[] = SEO_LANDING_PAGES.map((page) => ({
  path: getSeoLandingPagePath(page),
  changeFrequency: 'monthly' as const,
  priority: page.group === 'use-cases' || page.group === 'alternatives' ? 0.82 : 0.78,
}));

export default function sitemap(): MetadataRoute.Sitemap {
  return [...publicRoutes, ...industryRoutes, ...seoLandingRoutes, ...blogRoutes].map((route) => ({
    url: `${baseUrl}${route.path}`,
    // Omit unknown dates rather than marking every URL as changed on each deployment.
    ...(route.lastModified ? { lastModified: route.lastModified } : {}),
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
