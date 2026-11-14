"use client";

import Image from 'next/image';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Pagination, Autoplay } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/pagination';
import { Card, CardContent } from '@ui';
import { ArrowRight, Star } from 'lucide-react';
import { Testimonial } from '@/lib/testimonials';



export default function TestimonialsCarousel({ testimonials }: { testimonials: Testimonial[] }) {

  return (
    <Swiper
      modules={[Pagination, Autoplay]}
      pagination={{ clickable: true }}
      autoplay={{ delay: 5000 }}
      loop={true}
      slidesPerView={1}
      spaceBetween={16}
      centeredSlides={false}
      breakpoints={{
        640: { slidesPerView: 1, spaceBetween: 20 },
        768: { slidesPerView: 2, spaceBetween: 20 },
        1024: { slidesPerView: 3, spaceBetween: 20 },
      }}
      className="h-full pb-2 [&_.swiper-pagination]:relative! [&_.swiper-pagination]:bottom-auto! [&_.swiper-pagination]:mt-4! [&_.swiper-slide]:h-auto"
    >
      {testimonials.map((review, i) => (
        <SwiperSlide key={i} aria-label={`Testimonial: ${review.name}`} className="py-1.5">
          <Card className="h-full min-h-58 transition-all duration-300 hover:shadow-card-hover">
            <CardContent className="flex h-full flex-col pt-6">
                  <div className="flex gap-0.5 mb-4">
                    {Array.from({ length: review.stars }).map((_, sidx) => (
                      <Star key={sidx} className="h-4 w-4 fill-amber-400 text-amber-400" />
                    ))}
                  </div>
                  <p className="mb-6 text-sm leading-relaxed text-muted-foreground">{review.text}</p>
                  <div className="mt-auto flex items-center justify-between gap-3 absolute bottom-8">
                    <div className='flex gap-2'>
                    {review.avatarUrl ? (
                      <Image src={review.avatarUrl} alt={`${review.name} avatar`} width={30} height={30} className="h-8 w-8 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="h-8 w-8 rounded-full bg-navy flex items-center justify-center text-white text-xs font-bold shrink-0">
                        {review.avatar}
                      </div>
                    )}
                    <div className="min-w-0 text-xs">
                      <p className="font-semibold text-foreground">{review.name}</p>
                      <p className="text-muted-foreground">{review.role} · {review.publishedAt}</p>
                    </div>
                    </div>
                    {review.sourceUrl ? (
                      <a
                        href={review.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-xs text-brand-700 underline underline-offset-4"
                      >
                      {review.sourceName}
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </a>
                  ) : null}
                   </div>
            </CardContent>
          </Card>
        </SwiperSlide>
        
      ))}
    </Swiper>
  );
}
