'use client';

import { ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { INDUSTRIES } from '@/config/solutions.config';
import { cn } from '@/lib/utils';

interface SolutionsDropdownProps {
  lightSurfaceHeader: boolean;
}

export function SolutionsDropdown({ lightSurfaceHeader }: SolutionsDropdownProps) {
  return (
    <div className="group">
      <button
        className={cn(
          'text-sm transition-colors flex items-center gap-1 font-medium',
          lightSurfaceHeader
            ? 'text-slate-600 group-hover:text-brand'
            : 'text-slate-300 group-hover:text-white'
        )}
      >
        Solutions
        <ChevronDown
          size={16}
          className="transition-transform group-hover:rotate-180"
        />
      </button>

      <div className="absolute left-0 top-full mt-2 w-auto rounded-lg border border-slate-200 bg-white shadow-lg z-50 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200">
        <div className="p-4">
          <div className="mb-4">
            <h3 className="text-xs font-semibold uppercase text-slate-500 mb-3">By Industry</h3>
            <div className="grid grid-cols-2 mb-4">
              {INDUSTRIES.slice(0, 6).map((industry) => (
                <Link
                  key={industry.id}
                  href={`/solutions/by-industry/${industry.slug}`}
                  className="px-3 py-2 rounded hover:bg-blue-50 text-sm text-slate-700 hover:text-blue-600 transition-colors"
                >
                  {industry.name}
                </Link>
              ))}
            </div>
            <Link
              href="/solutions/by-industry"
              className="text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
            >
              View All Industries →
            </Link>
          </div>
          <div className="border-t border-slate-200 pt-4">
            <h3 className="text-xs font-semibold uppercase text-slate-500 mb-3">Explore</h3>
            <div className="grid grid-cols-2 gap-1">
              {[
                { label: 'Use Cases', href: '/use-cases' },
                { label: 'Integrations', href: '/integrations' },
                { label: 'Alternatives', href: '/alternatives' },
                { label: 'Comparisons', href: '/compare' },
              ].map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="px-3 py-2 rounded hover:bg-blue-50 text-sm text-slate-700 hover:text-blue-600 transition-colors"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
