import BlogIndexClient from './BlogIndexClient';
import { posts } from '@/lib/blog';

type BlogPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function BlogPage({ searchParams }: BlogPageProps = {}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const search = resolvedSearchParams?.search;
  const initialSearchQuery = Array.isArray(search) ? search[0] : search;

  return <BlogIndexClient posts={posts} initialSearchQuery={initialSearchQuery || ''} />;
}
