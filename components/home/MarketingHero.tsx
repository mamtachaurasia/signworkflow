import { CheckCheck, CheckCircle, ChevronDown } from 'lucide-react';

import { Badge } from '@ui';
import MarketingHeroActions from '@/components/home/MarketingHeroActions';

const heroBadges = [
  'Create and draft agreements',
  'AI review and clause insights',
  'Approval routing and e-signature',
  'Execute and retain records',
  'Team and role controls',
];

export default function MarketingHero() {
  return (
    <section className="relative pt-14 pb-6 flex items-center overflow-hidden sidebar-gradient">
      <div className="absolute inset-0 overflow-hidden">
        <div
          className="absolute -top-40 -right-40 w-150 h-150 rounded-full opacity-10"
          style={{
            background:
              'radial-gradient(circle, oklch(0.54 0.22 264) 0%, transparent 70%)',
          }}
        />
        <div
          className="absolute -bottom-40 -left-40 w-100 h-100 rounded-full opacity-8"
          style={{
            background:
              'radial-gradient(circle, oklch(0.54 0.22 264) 0%, transparent 70%)',
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              'linear-gradient(oklch(0.8 0 0) 1px, transparent 1px), linear-gradient(90deg, oklch(0.8 0 0) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }}
        />
      </div>

      <div className="relative max-w-7xl mx-auto py-32 w-full"> 
        <div className="m-auto xl:w-10/12 lg:w-10/12 sm:w-10/12   text-center px-4">
          <Badge className="mb-4 border-brand-300/35 px-4 py-2 text-brand-light! uppercase rounded-full whitespace-normal text-center">
            AI-Powered • Contract lifecycle management • Legally binding e-signature
          </Badge>
          <div className="font-bold mb-3">
            <h1 className="text-xl sm:text-5xl lg:text-6x text-brand-light">Manage Every Contract.</h1>
            <h2 className="text-white/90 text-2xl mt-2">From First Draft to Final Record.</h2>
            </div>
          <p className="text-white/70 text-sm">
            Create, review, approve, sign, execute, and retain agreements in one AI-powered workspace—with secure e-signature built in.
          </p>
      
          <MarketingHeroActions />

          <ul className="my-3 flex flex-wrap gap-4 text-xs text-white/60 justify-center">
            <li className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-emerald-400" /> 14-Day Free Trial
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-emerald-400" /> No credit card required
            </li>
          </ul>
        </div>

        <ul className="mt-6 flex flex-wrap gap-y-2 gap-x-4 text-xs text-white/60 justify-center">
          {heroBadges.map((badge) => (
            <li key={badge} className="inline-flex items-center gap-2">
              <CheckCheck className="h-4 w-4 text-emerald-400" />
              {badge}
            </li>
          ))}
        </ul>
      </div>

      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 text-white/30 text-xl animate-bounce">
        <ChevronDown className="h-6 w-6" />
      </div>
    </section>
  );
}
