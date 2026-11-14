'use client';

import { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';

export function BackToTopButton() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const toggleVisibility = () => {
      setIsVisible(window.scrollY > 300);
    };

    window.addEventListener('scroll', toggleVisibility);
    return () => window.removeEventListener('scroll', toggleVisibility);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  };

  return (
    <>
      {isVisible && (
        <button
          onClick={scrollToTop}
          aria-label="Back to top"
          className="fixed bottom-6 right-6 z-[999999] inline-flex items-center justify-center rounded-full bg-brand p-3 text-white transition-all duration-200 hover:bg-brand/90 shadow-lg hover:shadow-xl"
        >
          <ArrowUp className="h-5 w-5" />
        </button>
      )}
    </>
  );
}
