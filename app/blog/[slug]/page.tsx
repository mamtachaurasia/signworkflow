import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPostBySlug, posts } from '@/lib/blog';
import BlogPostPageClient from './BlogPostClient';
import JsonLd from '@/components/marketing/JsonLd';
import {
  buildBlogPostingStructuredData,
  buildBreadcrumbStructuredData,
} from '@/lib/structured-data';
import { getCanonicalUrl } from '@/lib/site';

type Props = {
  params: { slug: string } | Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const resolvedParams = await params;
  const post = getPostBySlug(resolvedParams.slug);

  if (!post) {
    return {
      title: 'Blog Post Not Found',
      alternates: {
        canonical: '/blog',
      },
    };
  }

  const url = `/blog/${post.slug}`;
  const images = post.thumbnail ? [{ url: post.thumbnail, alt: post.title }] : undefined;

  return {
    title: post.title,
    description: post.excerpt,
    keywords: post.tags,
    alternates: {
      canonical: url,
    },
    openGraph: {
      title: post.title,
      description: post.excerpt,
      type: 'article',
      url,
      publishedTime: post.date,
      authors: post.author ? [post.author] : undefined,
      tags: post.tags,
      images,
    },
    twitter: {
      card: post.thumbnail ? 'summary_large_image' : 'summary',
      title: post.title,
      description: post.excerpt,
      images: post.thumbnail ? [post.thumbnail] : undefined,
    },
  };
}

export function generateStaticParams() {
  return posts.map((post) => ({
    slug: post.slug,
  }));
}

// Extract headings from markdown or content for TOC
function extractHeadings(text: string) {
  const headings: { title: string; id: string; level: number; }[] = [];
  const lines = text.split('\n');
  lines.forEach((line) => {
    const match = line.match(/^## (.+)$/);
    if (match) {
      const title = match[1];
      const id = title
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-');
      headings.push({ title, id, level: 2 });
    }
  });
  return headings;
}

export default async function BlogPostPage({ params }: Props) {
  const resolvedParams = await params;
  const post = getPostBySlug(resolvedParams.slug);
  if (!post) return notFound();

  // For now, use post.content instead of reading markdown files
  const markdownContent = post.content || null;
  const headings = markdownContent ? extractHeadings(markdownContent) : [];
  const relatedPosts = posts.filter(p => p.slug !== post.slug).slice(0, 3);
  const path = `/blog/${post.slug}`;
  const breadcrumbs = [
    { name: 'Home', url: '/' },
    { name: 'Blog', url: '/blog' },
    { name: post.title, url: path },
  ];

  return (
    <>
      <JsonLd data={buildBreadcrumbStructuredData(breadcrumbs)} />
      <JsonLd
        data={buildBlogPostingStructuredData({
          path,
          title: post.title,
          description: post.excerpt,
          datePublished: post.date,
          author: post.author,
          image: post.thumbnail,
        })}
      />
      <BlogPostPageClient
        post={post}
        canonicalUrl={getCanonicalUrl(path)}
        markdownContent={markdownContent}
        headings={headings}
        relatedPosts={relatedPosts}
      />
    </>
  );
}
