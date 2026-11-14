'use client';

import Link from 'next/link';
import Image from 'next/image';
import { Share2 } from 'lucide-react';
import BlogCard from '../BlogCard';
import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import type { BlogPost } from '@/lib/blog';

type BlogHeading = {
  title: string;
  id: string;
  level: number;
};

const formattedDate = (date: Date) => {
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
};

export default function BlogPostPageClient({
  post,
  canonicalUrl,
  markdownContent,
  headings,
  relatedPosts,
}: {
  post: BlogPost;
  canonicalUrl: string;
  markdownContent: string | null;
  headings: BlogHeading[];
  relatedPosts: BlogPost[];
}) {
  const [tocExpanded, setTocExpanded] = useState(true);
  const [activeHeading, setActiveHeading] = useState<string | null>(null);

  useEffect(() => {
    const handleScroll = () => {
      // Update active heading in TOC
      if (headings.length === 0) return;
      const headingElements = headings.map(h =>
        document.getElementById(h.id)
      ).filter(Boolean);

      let current = null;
      for (const el of headingElements) {
        if (!el) continue;
        if (el.getBoundingClientRect().top < 100) {
          current = el.id;
        }
      }
      setActiveHeading(current);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [headings]);

  return (
    <main className="min-h-screen bg-white">
      {/* Breadcrumb */}
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <nav className="flex items-center gap-2 text-sm">
          <Link href="/" className="text-blue-600 hover:text-blue-700">
            Home
          </Link>
          <span className="text-slate-400">/</span>
          <Link href="/blog" className="text-blue-600 hover:text-blue-700">
            Blog
          </Link>
          <span className="text-slate-400">/</span>
          <span className="text-slate-600">{post.title}</span>
        </nav>
      </div>

      {/* Hero Section - Header and Image Side by Side */}
      <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid gap-12 md:grid-cols-2">
          {/* Content Side */}
          <div className="space-y-6">
            {/* Meta Info */}
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="text-slate-600">
                {post.date && formattedDate(new Date(post.date))}
              </span>
              {post.tags?.[0] && (
                <>
                  <span className="text-slate-400">•</span>
                  <span className="inline-block rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 capitalize">
                    {post.tags[0]}
                  </span>
                </>
              )}
            </div>

            {/* Title */}
            <h1 className="text-2xl font-bold text-slate-900 transition-color md:text-5xl">
              {post.title}
            </h1>
            {/* Author Info */}
            <div className="flex items-center gap-4">
              {post.authorAvatar ? (
                <Image
                  src={post.authorAvatar}
                  alt={post.author || 'Article author'}
                  className="h-12 w-12 rounded-full object-cover"
                  width={48}
                  height={48}
                />
              ) : post.avatar ? (
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold text-white">
                  {post.avatar}
                </div>
              ) : null}
              <div>
                {post.author && (
                  <p className="font-semibold text-slate-900">{post.author}</p>
                )}
                <p className="text-sm text-slate-600">
                  {post.readingTime || '5 min read'}
                </p>
              </div>
            </div>
          </div>

          {/* Featured Image Side */}
          {post.thumbnail && (
            <div className="relative aspect-video overflow-hidden rounded-lg bg-slate-100 shadow-lg">
             <Image
                src={post.thumbnail}
                alt={post.title}
                className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
                width={500}
                height={500}
                 quality={100}
              />
            </div>
          )}
        </div>
      </section>

      {/* Content + Sidebar Layout */}
      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-4">
          {/* Main Content */}
          <div className="lg:col-span-3">
            <article className="prose prose-slate max-w-none prose-h2:text-2xl prose-h2:font-bold prose-h2:text-slate-900 prose-h2:mt-8 prose-h2:mb-4 prose-p:text-slate-600 prose-p:leading-8">
              {markdownContent ? (
                <ReactMarkdown
                  components={{
                    h2: ({ children }) => {
                      const text = String(children);
                      const id = text
                        .toLowerCase()
                        .replace(/[^\w\s-]/g, '')
                        .replace(/\s+/g, '-');
                      return (
                        <h2 id={id} className="text-xl font-bold scroll-mt-20 my-8">
                          {text}
                        </h2>
                      );
                    },
                  }}
                >
                  {markdownContent}
                </ReactMarkdown>
              ) : post.content ? (
                <div className="space-y-6">
                  {post.content.split('\n\n').map((p: string, i: number) => (
                    <p key={i} className="text-base leading-8 text-slate-600">
                      {p}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="text-slate-600">Article content coming soon.</p>
              )}
            </article>

            {/* Social Share */}
            <div className="mt-12 border-t border-slate-200 pt-8">
              <p className="mb-4 text-sm font-semibold text-slate-900">
                Like what you see? Share with a friend.
              </p>
              <div className="flex gap-3">
                {[
                  {
                    name: 'Twitter',
                    href: `https://twitter.com/intent/tweet?url=${canonicalUrl}&text=${post.title}`,
                  },
                  {
                    name: 'LinkedIn',
                    href: `https://www.linkedin.com/sharing/share-offsite/?url=${canonicalUrl}`,
                  },
                  {
                    name: 'Facebook',
                    href: `https://www.facebook.com/sharer/sharer.php?u=${canonicalUrl}`,
                  },
                ].map(social => (
                  <a
                    key={social.name}
                    href={social.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center h-10 w-10 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                    aria-label={`Share on ${social.name}`}
                  >
                    <Share2 className="h-4 w-4" />
                  </a>
                ))}
              </div>
            </div>

            {/* Related Posts */}
            {relatedPosts.length > 0 && (
              <div className="mt-12 border-t border-slate-200 pt-12">
                <h2 className="mb-8 text-2xl font-bold text-slate-900">
                  Latest articles
                </h2>
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  <BlogCard posts={relatedPosts} />
                </div>
                <div className="mt-8 text-center">
                  <Link
                    href="/blog"
                    className="inline-flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700 transition-colors"
                  >
                    View all blog posts →
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* Sticky Sidebar */}
          {headings.length > 0 && (
            <aside className="hidden lg:block">
              <div className="sticky top-20 space-y-6">
                {/* Table of Contents */}
                <div className="rounded-lg border border-slate-200 bg-white p-6">
                  <button
                    onClick={() => setTocExpanded(!tocExpanded)}
                    className="flex w-full items-center justify-between gap-2"
                  >
                    <h3 className="font-semibold text-slate-900">
                      Table of Contents
                    </h3>
                    <svg
                      className={`h-5 w-5 text-slate-600 transition-transform ${
                        tocExpanded ? 'rotate-180' : ''
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 14l-7 7m0 0l-7-7m7 7V3"
                      />
                    </svg>
                  </button>

                  {tocExpanded && (
                    <nav className="mt-4 space-y-2">
                      {headings.map((heading, i) => (
                        <a
                          key={i}
                          href={`#${heading.id}`}
                          className={`block text-sm transition-colors ${
                            activeHeading === heading.id
                              ? 'font-semibold text-blue-600'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          <span className="mr-2 text-slate-400">{i + 1}.</span>
                          {heading.title}
                        </a>
                      ))}
                    </nav>
                  )}
                </div>

                {/* CTA Card */}
                <div className="rounded-lg border border-slate-200 bg-blue-50 p-6 text-center">
                  <h4 className="font-semibold text-slate-900">
                    Sign Docs 3x Faster
                  </h4>
                  <p className="mt-2 text-sm text-slate-600">
                    Send, sign, and manage documents securely and efficiently.
                  </p>
                  <Link
                    href="/register"
                    className="mt-4 inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
                  >
                    Try it Today
                  </Link>
                </div>
              </div>
            </aside>
          )}
        </div>
      </section>

    </main>
  );
}
