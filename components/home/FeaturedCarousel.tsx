"use client";

import Link from 'next/link'
import { Badge, Button } from '@ui';
import { posts as sharedPosts } from '@/lib/blog';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation, Pagination, Autoplay } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/navigation';
import 'swiper/css/pagination';
import BlogCard from '@/app/blog/BlogCard';
import { ChevronLeft, ChevronRight } from 'lucide-react'


export default function FeaturedCarousel({ posts = sharedPosts }: { posts?: typeof sharedPosts }) {
  return (
    <section className="relative overflow-hidden py-12 bg-gray-50" role="region" aria-label="Featured blog posts">
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col items-center text-center">
          <Badge className="mb-4 bg-brand/10 text-brand border-brand/20 uppercase tracking-wider text-xs font-semibold">
            From the blog
          </Badge>
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-4">
             Product guidance & use cases
            </h2>         
          <p className="text-lg text-muted-foreground">
              Curated posts that help teams adopt signing workflows and templates.
          </p>
          <Button asChild variant="link" size="sm">
            <Link href="/blog">View all articles</Link>
          </Button>
            
        </div>
    <Swiper
      modules={[Navigation, Pagination, Autoplay]}
      navigation = {{
        nextEl: '.swiperButton-next',
        prevEl: '.swiperButton-prev',
      }}
      autoplay={{ delay: 5000 }}
      loop={true}
      slidesPerView={1}
      spaceBetween={10}
      breakpoints={{
        640: { slidesPerView: 1 },
        768: { slidesPerView: 2 },
        1024: { slidesPerView: 3 },
      }}
      className="pb-16 h-full"
    >
        {posts.slice(0, 6).map((post, index) => (
          <SwiperSlide key={post.slug} aria-label={`Slide: ${post.title}`} className="h-auto px-2 py-4 sm:px-4">
            <BlogCard posts={[post]} priority={index === 0} />
          </SwiperSlide>
        ))}
    </Swiper>
    
      
          <Button
               type="button"
               variant="secondary"
               aria-label="Previous featured article"
               className="swiperButton-prev absolute left-2 top-1/2 z-10 hidden -translate-y-1/2 bg-white/95 text-blue-700 shadow-md hover:bg-white sm:inline-flex"
               size="icon-lg">
                
              <ChevronLeft className="h-8 w-8"/>
          </Button>
          <Button
               type="button"
               variant="secondary"
               size="icon-lg"
               aria-label="Next featured article"
               className="swiperButton-next absolute right-2 top-1/2 z-10 hidden -translate-y-1/2 bg-white/95 text-blue-700 shadow-md hover:bg-white sm:inline-flex">

              <ChevronRight className="h-8 w-8"/>
          </Button>


    </div>
    </section>
  );
}
