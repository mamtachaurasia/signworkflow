'use client';
import { usePathname } from 'next/navigation';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { BackToTopButton } from '@/components/BackToTopButton';
import React, { useEffect } from 'react';
import { AuthProvider } from '@/components/auth/AuthProvider';
import AuthStateBridge from '@/components/auth/AuthStateBridge';
import StoreProvider from '@/store/StoreProvider';

export default function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const appPath = pathname.startsWith('/builder') || pathname.startsWith('/dashboard') || /^\/templates\/[^/]+\/edit\/?$/.test(pathname);
  const hideHeaderFooter = pathname != null && (appPath || pathname.startsWith('/sign'));
  
  useEffect(() => {
    const html = document.documentElement;
    if (appPath) {
      html.classList.add('overflow-hidden');
    } else {
      html.classList.remove('overflow-hidden');
    }
    // optional cleanup (helps during fast route changes)
    return () => {
      html.classList.remove('overflow-hidden');
    };
  }, [appPath]);
   // Scroll to top on every route change
  useEffect(() => {
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: 'auto',
    });
  }, [pathname]);
  return (
    <main className={`min-h-screen`}>
      <StoreProvider>
        <AuthProvider>
          <AuthStateBridge />
          {!hideHeaderFooter && <Header />}
          {children}
          {!hideHeaderFooter && <Footer />}
          {!hideHeaderFooter && <BackToTopButton />}
        </AuthProvider>
      </StoreProvider>
    </main>
  );
}
