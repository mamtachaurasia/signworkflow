import Link from "next/link";
import Image from "next/image";
import { BlogPost, posts as defaultPosts } from '@/lib/blog';

type BlogCardProps = {
  posts?: BlogPost[],
  priority?: boolean
}

const formattedDate = (date: Date) => {
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
};

const BlogCard = ({ posts = defaultPosts,  priority = false }: BlogCardProps) => {
  return (
    <>
      {posts?.map((post) => (
        <article
          key={post.slug}
          className="group flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white transition-all hover:shadow-lg hover:border-slate-300"
        >
          {/* Image Container */}
          {post.thumbnail && (
            <Link href={`/blog/${post.slug}`} aria-label={post.title}>
              <div className="relative aspect-video overflow-hidden bg-slate-100">
                <Image
                  src={post.thumbnail}
                  alt={post.title}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  width={500}
                  height={500}
                  quality={100}
                  priority={priority}
                />
              </div>
            </Link>
          )}

          {/* Content */}
          <div className="flex flex-1 flex-col p-6">
            {/* Meta: Date & Category */}
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 mb-3">
              {post.date && (
                <time dateTime={post.date}>
                  {formattedDate(new Date(post.date))}
                </time>
              )}
              {post.tags?.[0] && (
                <>
                  <span className="text-slate-400">•</span>
                  <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-700 capitalize">
                    {post.tags[0]}
                  </span>
                </>
              )}
            </div>

            {/* Title */}
            <h3 className="mb-3 flex-1">
              <Link
                href={`/blog/${post.slug}`}
                className="font-bold text-slate-900 transition-colors hover:text-blue-600 line-clamp-2"
              >
                {post.title}
              </Link>
            </h3>

            {/* Excerpt */}
            <p className="mb-4 text-sm leading-relaxed text-slate-600 line-clamp-2">
              {post.excerpt}
            </p>

            {/* Footer: Author & Reading Time */}
            <div className="flex items-center gap-2 border-t border-slate-100 pt-4">
              {post.author && (
                <div className="flex items-center gap-2 text-xs">
                  {post.authorAvatar ? (
                    <Image
                      src={post.authorAvatar}
                      alt={post.author}
                      className="h-6 w-6 rounded-full object-cover"
                      width={24}
                      height={24}
                    />
                  ) : post.avatar ? (
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white">
                      {post.avatar}
                    </div>
                  ) : null}
                  <span className="text-slate-600">{post.author}</span>
                </div>
              )}
              {post.readingTime && (
                <>
                  <span className="text-slate-400">•</span>
                  <span className="text-xs text-slate-600">{post.readingTime} read</span>
                </>
              )}
            </div>
          </div>
        </article>
      ))}
    </>
  );
}

export default BlogCard;
