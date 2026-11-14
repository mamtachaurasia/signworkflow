'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';
import { Search, X } from 'lucide-react';
import BlogCard from './BlogCard';
import type { BlogPost } from '@/lib/blog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';

const formattedDate = (date: Date) => {
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
};

export default function BlogIndexClient({
  posts,
  initialSearchQuery = '',
}: {
  posts: BlogPost[];
  initialSearchQuery?: string;
}) {
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const allCategories = Array.from(new Set(posts.flatMap((post) => post.tags || []))).sort();
  const featuredPost = posts[0];

  const filteredOtherPosts = posts.slice(1).filter((post) => {
    const normalizedSearch = searchQuery.toLowerCase();
    const matchesSearch =
      !searchQuery ||
      post.title.toLowerCase().includes(normalizedSearch) ||
      post.excerpt.toLowerCase().includes(normalizedSearch);

    const matchesCategory = !selectedCategory || post.tags?.includes(selectedCategory);

    return matchesSearch && matchesCategory;
  });

  return (
    <>
      {featuredPost && (
        <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="grid gap-8 md:grid-cols-2 items-start">
            <div className="order-2 flex flex-col justify-center md:order-1 mt-4">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
                  {featuredPost.date && (
                    <time dateTime={featuredPost.date}>
                      {formattedDate(new Date(featuredPost.date))}
                    </time>
                  )}
                  {featuredPost.tags?.[0] && (
                    <>
                      <span className="text-slate-400">•</span>
                      <span className="inline-block rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 capitalize">
                        {featuredPost.tags[0]}
                      </span>
                    </>
                  )}
                </div>

                <h2>
                  <Link
                    href={`/blog/${featuredPost.slug}`}
                    className="text-2xl font-bold text-slate-900 transition-colors hover:text-blue-600 md:text-5xl"
                  >
                    {featuredPost.title}
                  </Link>
                </h2>

                <p className="text-base text-slate-600 leading-relaxed">
                  {featuredPost.excerpt}
                </p>

                <div>
                  <Link
                    href={`/blog/${featuredPost.slug}`}
                    className="inline-flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700 transition-colors"
                  >
                    Read article →
                  </Link>
                </div>
              </div>
            </div>

            <div className="order-1 md:order-2">
              <Link href={`/blog/${featuredPost.slug}`} aria-label={featuredPost.title}>
                <div className="relative aspect-video overflow-hidden rounded-lg bg-slate-100 shadow-lg">
                  {featuredPost.thumbnail && (
                    <Image
                      src={featuredPost.thumbnail}
                      alt={featuredPost.title}
                      className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
                      width={500}
                      height={500}
                      quality={100}
                    />
                  )}
                </div>
              </Link>
            </div>
          </div>
        </section>
      )}

      <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 text-center">
        <h1 className=" text-4xl font-bold text-slate-900 md:text-5xl">Blogs</h1>
        <small>Ideas, notes, and product guidance</small>
        <p className="text-slate-600">
          Insights on document operations, signing workflows, trust-oriented product behavior, and
          practical rollout guidance for teams.
        </p>

        <div className="flex items-center justify-center md:flex-row my-4">
          <div className="relative w-full md:w-96">
            <Search className="absolute inset-y-2.5 inset-x-3 h-5 w-5 text-slate-400" />
            <Input
              type="text"
              placeholder="Search articles..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="px-10 rounded-r-none"
            />
            {searchQuery && (
              <X
                className="absolute inset-y-2.5 right-3 h-5 w-5 text-slate-400"
                onClick={() => setSearchQuery('')}
              />
            )}
          </div>

          {allCategories.length > 0 && (
            <Select
              value={selectedCategory ?? ''}
              onChange={(event) => setSelectedCategory(event.target.value || null)}
              placeholder="All Categories"
              className="rounded-l-none h-10 min-w-36"
            >
              <option value="">All Categories</option>
              {allCategories.map((category) => (
                <option key={category} value={category}>
                  {category.charAt(0).toUpperCase() + category.slice(1)}
                </option>
              ))}
            </Select>
          )}
        </div>
      </section>

      {filteredOtherPosts.length === 0 ? (
        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-center rounded-lg border border-slate-200 bg-slate-50 py-16 text-center">
            <svg
              className="mb-4 h-12 w-12 text-slate-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <h3 className="mt-2 text-lg font-semibold text-slate-900">No articles found</h3>
            <p className="mt-1 text-sm text-slate-600">
              Try adjusting your search or filter to find what you&apos;re looking for.
            </p>
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory(null);
              }}
              className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              Clear filters
            </button>
          </div>
        </section>
      ) : (
        <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <h2 className="mb-8 text-2xl font-bold text-slate-900">Latest articles</h2>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            <BlogCard posts={filteredOtherPosts} />
          </div>
        </section>
      )}
    </>
  );
}
