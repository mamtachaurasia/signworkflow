'use client';

import { Industry } from '@/config/solutions.config';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

interface IndustryCardProps {
  industry: Industry;
}

export function IndustryCard({ industry }: IndustryCardProps) {
  return (
    <Link href={`/solutions/by-industry/${industry.slug}`}>
      <div className="group h-full rounded-lg border border-slate-200 bg-white p-6 transition-all hover:border-blue-300 hover:shadow-lg hover:shadow-blue-50">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h3 className="mb-2 text-xl font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">
              {industry.name}
            </h3>
            <p className="text-sm text-slate-600">{industry.shortDescription}</p>
          </div>
        </div>

        <div className="mb-4">
          <h4 className="mb-2 text-xs font-semibold uppercase text-slate-500">Key Benefits</h4>
          <ul className="space-y-1">
            {industry.benefits.slice(0, 3).map((benefit, idx) => (
              <li key={idx} className="text-sm text-slate-600 flex items-center gap-2">
                <span className="text-blue-500">•</span>
                {benefit}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex items-center gap-2 text-blue-600 font-medium text-sm group-hover:gap-3 transition-all">
          Learn More <ChevronRight size={16} />
        </div>
      </div>
    </Link>
  );
}
