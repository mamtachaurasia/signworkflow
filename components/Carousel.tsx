'use client';

import Image from 'next/image';
import { useReducedMotion } from 'motion/react';

import { Badge } from '@ui';
import { cn } from '@/lib/utils';

const logos = [
  { alt: 'Niva', src: '/images/client_logo/niva.svg' },
  { alt: 'Bank of India', src: '/images/client_logo/boi.svg' },
  { alt: 'Bajaj Capital', src: '/images/client_logo/bajajcapital.svg' },
  { alt: 'Badjate', src: '/images/client_logo/badjate.svg' },
  { alt: 'Bonanza', src: '/images/client_logo/bananza.svg' },
  { alt: 'Cholamandalam', src: '/images/client_logo/cholams.svg' },
  { alt: 'Emkay Global', src: '/images/client_logo/emkay.svg' },
  { alt: 'GNG', src: '/images/client_logo/gng.svg' },
  { alt: 'JM Financial', src: '/images/client_logo/JM financial.svg' },
  { alt: 'AC Agarwal', src: '/images/client_logo/ac aggarwal.svg' },
  { alt: 'Kunvarji', src: '/images/client_logo/kunwar ji.svg' },
  { alt: 'Marwadi Online', src: '/images/client_logo/marwadi.svg' },
  { alt: 'MoneyIsle', src: '/images/client_logo/moneyisle.svg' },
  { alt: 'Niva Bupa', src: '/images/client_logo/Nivabupa.svg' },
  { alt: 'RKFS', src: '/images/client_logo/rkfs.svg' },
  { alt: 'SPFL', src: '/images/client_logo/spfl.svg' },
  { alt: 'Sharewealth', src: '/images/client_logo/sharewealth.svg' },
  { alt: 'Sunidhi', src: '/images/client_logo/sunidhi.svg' },
  { alt: 'Suresh Rathi', src: '/images/client_logo/suresha rathi.svg' },
  { alt: 'Tradewell', src: '/images/client_logo/tradewell.svg' },
];

type LogoSetProps = {
  ariaHidden?: boolean;
};

function LogoTile({ alt, src }: { alt: string; src: string }) {
  return (
    <div
      className={cn(
        'flex h-20 min-w-[152px] items-center justify-center  transition duration-300 sm:h-24 sm:min-w-[184px] sm:px-6',
        'hover:-translate-y-0.5',
        '[&_img]:h-8 [&_img]:w-auto [&_img]:object-contain [&_img]:opacity-70 [&_img]:grayscale [&_img]:saturate-0 [&_img]:transition [&_img]:duration-300 sm:[&_img]:h-10',
        'hover:[&_img]:opacity-100 hover:[&_img]:grayscale-0 hover:[&_img]:saturate-100'
      )}
    >
      <Image alt={alt} width={132} height={44} src={src} loading="lazy" />
    </div>
  );
}

function LogoSet({ ariaHidden = false }: LogoSetProps) {
  return (
    <div className="flex shrink-0 items-center gap-4 pr-4 sm:gap-5 sm:pr-5" aria-hidden={ariaHidden || undefined}>
      {logos.map((logo) => (
        <LogoTile
          key={`${ariaHidden ? 'clone' : 'base'}-${logo.src}`}
          alt={logo.alt}
          src={logo.src}
        />
      ))}
    </div>
  );
}

const Carousel = () => {
  const reduceMotion = useReducedMotion();

  return (
      <div className="mx-auto Xmax-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto Xmax-w-3xl text-center">
          <Badge className="border-brand/15 bg-brand/10 px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-brand">
            Trusted teams
          </Badge>
          <h2 className="mt-5 text-3xl font-bold text-foreground sm:text-4xl">
            Trusted by companies with document-heavy workflows
          </h2>
          <p className="mt-4 text-base leading-7 text-muted-foreground sm:text-lg">
            Financial services, operations, and compliance-led teams rely on SignWorkflow to move
            documents quickly without losing control of the record.
          </p>
        </div>

        <div className="group relative  overflow-hidden p-5">
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-white via-white/90 to-transparent sm:w-24" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-white via-white/90 to-transparent sm:w-24" />

          {reduceMotion ? (
            <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-5">
              {logos.map((logo) => (
                <LogoTile
                  key={`static-${logo.src}`}
                  alt={logo.alt}
                  src={logo.src}
                />
              ))}
            </div>
          ) : (
            <div
              className="logo-marquee-track flex w-max items-center will-change-transform group-hover:[animation-play-state:paused]"
              style={{ ['--logo-marquee-duration' as string]: '34s' }}
            >
              <LogoSet />
              <LogoSet ariaHidden />
            </div>
          )}
        </div>
      </div>
  );
};

export default Carousel;
