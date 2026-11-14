'use client'

import { Dispatch, SetStateAction, useEffect, useState } from 'react';
import { ArrowRight, Menu, X } from 'lucide-react';
import Link from 'next/link';
import useContextStore from '@/hooks/useContextStore';
import { usePathname } from 'next/navigation';
import UserDropdown from './UserDropdown';
import Brand from './Brand';
import { useAuth } from '@/components/auth/AuthProvider';
import { AnimatePresence, motion } from 'motion/react';
import { Button } from '@ui';
import { cn } from '@/lib/utils';
import { SolutionsDropdown } from './solutions/SolutionsDropdown';

const navLinks = [
  { label: 'Features', href: '/#features', id: 'features' },
  { label: 'How It Works', href: '/#how-it-works', id: 'how-it-works' },
  { label: 'Security', href: '/#security', id: 'security' },
  { label: 'Pricing', href: '/pricing', id: 'pricing' },
  { label: 'FAQ', href: '/#faq', id: 'faq' },
];

type MobileMenuProps = {
  mobileMenuOpen?: boolean;
  setMobileMenuOpen?: Dispatch<SetStateAction<boolean>>;
};

export function Header({ mobileMenuOpen, setMobileMenuOpen }: MobileMenuProps) {
  const { isLoggedIn } = useContextStore();
  const { isLoading } = useAuth();
  const pathname = usePathname();
  const [lightSurfaceHeader, setLightSurfaceHeader] = useState(pathname !== '/');
  const [internalMobileMenuOpen, setInternalMobileMenuOpen] = useState(false);
  const resolvedMobileMenuOpen = mobileMenuOpen ?? internalMobileMenuOpen;
  const resolvedSetMobileMenuOpen = setMobileMenuOpen ?? setInternalMobileMenuOpen;

  useEffect(() => {
    const updateHeaderTone = () => {
      if (pathname !== '/') {
        setLightSurfaceHeader(true);
        return;
      }

      const featuresSection = document.getElementById('features');
      if (!featuresSection) {
        setLightSurfaceHeader(window.scrollY > 80);
        return;
      }

      const headerThreshold = 84;
      setLightSurfaceHeader(featuresSection.getBoundingClientRect().top <= headerThreshold);
    };

    updateHeaderTone();
    window.addEventListener('scroll', updateHeaderTone, { passive: true });
    window.addEventListener('resize', updateHeaderTone);

    return () => {
      window.removeEventListener('scroll', updateHeaderTone);
      window.removeEventListener('resize', updateHeaderTone);
    };
  }, [pathname]);

  return (
    <header
      className={cn(
        'fixed top-0 z-40 w-full backdrop-blur-xs transition-[background-color,box-shadow] duration-300',
        lightSurfaceHeader
          ? 'border-slate-200/80 bg-white/95 shadow-sm'
          : ''
      )}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-18 items-center justify-between">
          <div className="flex items-center gap-8 xl:gap-20">
          <Brand color={lightSurfaceHeader ? '#285feb' : '#ffffff'} />
          <nav className="relative hidden items-center gap-5 lg:flex xl:gap-8 mt-3">
            <SolutionsDropdown lightSurfaceHeader={lightSurfaceHeader} />
            {navLinks.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className={cn(
                  'text-sm transition-colors',
                  lightSurfaceHeader
                    ? 'text-slate-600 hover:text-brand'
                    : 'text-slate-300 hover:text-white'
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className={cn(
                'rounded-full p-2 transition-colors lg:hidden',
                lightSurfaceHeader
                  ? 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
                  : 'text-white/70 hover:bg-white/10 hover:text-white'
              )}
              onClick={() => resolvedSetMobileMenuOpen((value) => !value)}
              aria-label="Toggle menu"
            >
              {resolvedMobileMenuOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </button>

            <div className="hidden items-center gap-2 xl:gap-4 lg:flex mt-3">
              {isLoading ? (
                <div className="h-8 w-8 animate-pulse rounded-full bg-gray-200" />
              ) : isLoggedIn ? (
                <UserDropdown />
              ) : (
                <>
                  <Link
                    href="/login"
                    className={cn(
                      'text-sm font-medium transition-colors',
                      lightSurfaceHeader
                        ? 'text-slate-700 hover:text-brand'
                        : 'text-white/80 hover:text-white'
                    )}
                  >
                    Login
                  </Link>
                  <Button asChild variant="brand" size="sm">
                    <Link href="/register">Free trial</Link>
                  </Button>
                  <Link
                    href="/request-demo"
                    className="group relative flex h-9 shrink-0 items-center overflow-hidden rounded-full bg-white pl-5 pr-11 text-xs font-medium whitespace-nowrap text-slate-900 shadow-[0_0_0_1px_rgba(0,0,0,0.1)] transition-all"
                  >
                    <span className="relative z-10">Book a Demo</span>
                    <div className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-end rounded-full bg-brand-100 px-2 transition-all duration-300 group-hover:w-[calc(100%-0.5rem)]">
                      <ArrowRight size={16} className="-rotate-45 group-hover:rotate-0" />
                    </div>
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {resolvedMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className={cn(
              'border-t lg:hidden',
              lightSurfaceHeader
                ? 'border-slate-200 bg-white shadow-lg'
                : 'border-white/10 bg-navy'
            )}
          >
            <div className="space-y-1 px-4 py-4">
              {navLinks.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  onClick={() => resolvedSetMobileMenuOpen(false)}
                  className={cn(
                    'block w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors',
                    lightSurfaceHeader
                      ? 'text-slate-700 hover:bg-slate-100 hover:text-slate-950'
                      : 'text-white/80 hover:bg-white/10 hover:text-white'
                  )}
                >
                  {item.label}
                </Link>
              ))}
              {!isLoading && !isLoggedIn ? (
                <div className="mt-4 grid gap-2 pt-3">
                  <Button asChild variant="brand" size="sm" className="w-full justify-center rounded-full">
                    <Link href="/register">Free trial</Link>
                  </Button>
                  <Button asChild type="button" role="switch" variant="outline" size="sm" className="w-full justify-center">
                    <Link href="/request-demo">
                      Book a Demo
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </div>
              ) : null}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
