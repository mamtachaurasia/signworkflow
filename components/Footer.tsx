'use client';
import { ShieldCheck, Linkedin } from 'lucide-react';
import Brand from './Brand';
import Link from 'next/link';
import { Separator } from '@ui';
import FooterCTA from './common/FooterCTA';
import { CookieSettingsButton } from './cookie/CookieSettingsButton';
import { aiTools, COMPANY } from '@/lib/site';
import Image from 'next/image'
const footerGroups: FooterGroup[] = [
  {
    title: 'Company',
    links: [
      { label: 'About us', href: '/about' },
      { label: 'Why SignWorkflow?', href: '/why-signWorkflow' },
      { label: 'Solutions', href: '/solutions' },
      { label: 'Use Cases', href: '/use-cases' },
      { label: 'Blog', href: '/blog' },
      { label: 'Help Center', href: 'https://support.signworkflow.com/kb' },
    ],
  },
  {
    title: 'Product',
    links: [
      { label: 'Template Library', href: '/templates' },
      { label: 'Pricing', href: '/pricing' },
      { label: 'Integrations', href: '/integrations' },
      { label: 'eSign for HR', href: '/esign-for-hr' },
      { label: 'Vendor Agreements', href: '/esign-for-vendor-agreements' },
      { label: 'Alternatives', href: '/alternatives' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Request Demo', href: '/request-demo' },
      { label: 'Developer API', href: '/developers/api' },
      { label: 'Free Document analyzer', href: 'https://docanalyzer.signworkflow.com/' },
      { label: 'Contact sales', href: '/contact' },
      //{ label: 'Trust Center', href: '/trust' },
      { label: 'Security', href: '/security' },
      { label: 'Comparisons', href: '/compare' },
      { label: 'Privacy Policy', href: '/privacy' },
    ],
  },
  {
    title: 'Access',
    links: [
      { label: 'Sign In', href: '/login' },
      { label: 'Start free trial', href: '/register' },
    ],
  },
  // {
  //   title: "Legal",
  //   links: [
  //     { label: 'Privacy Policy', href: '/privacy' },
  //     { label: 'Terms of Service', href: '/terms' },
  //     { label: 'Cookie Policy', href: '/cookies' },
  //     { label: 'Security Policy', href: '/security' },
  //   ],
  // },
];
{/* ═══════════════════════════════════════════════════════
    FOOTER
═══════════════════════════════════════════════════════ */}
export function Footer() {
  return (
    <>
    <FooterCTA />
    <footer className="bg-navy-dark">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
              {/* Top row */}
              <div className="flex flex-col md:flex-row items-start gap-10 pb-10 border-b border-white/10">
                {/* Brand */}
                <div className="md:w-64 shrink-0">
                  <div className="flex items-center gap-2.5 mb-4">
                      <Brand color='#ffffff' />
                  </div>
                  <p className="text-sm text-white/50 leading-relaxed mb-4">
                    Contract lifecycle workspace with AI review, secure e-signature flows, audit-ready records, and governance-aware document handling.
                  </p>
                  <div className="flex items-center gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5 text-brand-light" />
                    <span className="text-xs text-white/40">
                       SHA-256 Protected
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-2">
                    <ShieldCheck className="h-3.5 w-3.5 text-brand-light" />
                    <span className="text-xs text-white/40 ">
                      Audit and governance aware
                    </span>
                  </div>

                  {/* Company info */}
                  {/* <div className="mt-5 space-y-2 text-xs text-white/50">
                    <p className="font-medium text-white/70">{COMPANY.legalName}</p>
                    <p className="flex items-start gap-2 leading-relaxed">
                      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/30" />
                      <span>
                        {COMPANY.hq.street}, {COMPANY.hq.city}, {COMPANY.hq.region} {COMPANY.hq.postalCode}, {COMPANY.hq.country}
                      </span>
                    </p>
                    <a
                      href={`mailto:${COMPANY.contact.general}`}
                      className="flex items-center gap-2 transition hover:text-white/80"
                    >
                      <Mail className="h-3.5 w-3.5 shrink-0 text-white/30" />
                      <span>{COMPANY.contact.general}</span>
                    </a>
                  </div> */}

                  {/* Social */}
                  <a
                    href={COMPANY.social.linkedin}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-flex items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-xs font-medium text-white/60 transition hover:border-white/30 hover:text-white"
                    aria-label="SignWorkflow on LinkedIn"
                  >
                    <Linkedin className="h-4 w-4" />
                    LinkedIn
                  </a>
                </div>

                {/* Links */}
                <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-8 pt-5">
                   {footerGroups.map((group) => (
                    <FooterColumn key={group.title} group={group} />
                  ))}
                </div>
              </div>
            <AiSummary/>
              {/* Bottom row */}
              <div className="pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                <p className="text-xs text-white/40">
                  © {new Date().getFullYear()} SignWorkflow. All rights reserved.
                </p>
                <div className="flex flex-wrap items-center gap-3 text-xs text-white/35">
                  <Link href="/security" className="transition hover:text-white">
                    Security
                  </Link>
                  <Separator orientation="vertical" className="h-3 bg-white/20" />
                  <Link href="/trust" className="transition hover:text-white">
                    Trust
                  </Link>
                  <Separator orientation="vertical" className="h-3 bg-white/20" />
                  <Link href="/privacy" className="transition hover:text-white">
                    Privacy
                  </Link>
                  <Separator orientation="vertical" className="h-3 bg-white/20" />
                  <Link href="/cookies" className="transition hover:text-white">
                    Cookies
                  </Link>
                  <Separator orientation="vertical" className="h-3 bg-white/20" />
                  <CookieSettingsButton />
                  <Separator orientation="vertical" className="h-3 bg-white/20" />
                  <Link href="/terms" className="transition hover:text-white">
                    Terms
                  </Link>
                </div>
              </div>
            </div>
    </footer>
    </>
  );
}



type FooterGroup = {
  title: string;
  links: Array<{ label: string; href: string }>;
};

function FooterColumn({ group }: { group: FooterGroup }) {
  return (
    <div key={group.title}>
      <p className="text-sm font-semibold text-white mb-3">
        {group.title}
      </p>
      <ul className="space-y-2">
        {group.links.map((link) => (
          <li key={link.label}>
            <Link
              href={link.href}
              {...(link.href.startsWith('http')
                ? { target: '_blank', rel: 'noopener noreferrer' }
                : {})}
              className="text-xs text-white/50 hover:text-white/80 transition-colors"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
export default function AiSummary() {
  return (
    <div className="flex justify-between py-6 border-b border-white/10">
      {/* AI Summary */}
      <div className="">
       <p className='text-white/90 text-xs mb-2'>Ask AI for a summary of Signworkflow</p>
        <div className="flex items-center gap-4">
          {
          aiTools.map((tool) => {
             const Icon = tool.image;
            return (
              <a
              key={tool.name}
              href={tool.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Open AI summary in ${tool.name}`}
            >
              <Icon className="h-6 w-6 text-white" />
            </a>
          
            )
          })
          }
        </div>
      </div>

      {/* Compliance Badges */}
      <div className="">
        <p className='text-white/90 text-xs mb-2'>Review Signworkflow</p>
       <div className="flex items-center gap-4">
          <a
            href="https://www.trustpilot.com/evaluate/signworkflow.com?utm_source=badge-product_review&utm_medium=badge"
            target="_blank"
            rel="noopener noreferrer"
            className="h-8 w-auto"
          >
            <Image
              src="https://cdn.trustpilot.net/brand-assets/4.3.0/logo-white.svg"
              alt="SignWorkflow on Trustpilot"
              width={150}
              height={54}
              className="h-6 w-auto mt-1"
            />
          </a>

          <a
            href="https://www.producthunt.com/products/signworkflow/reviews/new?utm_source=badge-product_review&utm_medium=badge"
            target="_blank"
            rel="noopener noreferrer"
            className="h-8 w-auto"
          >
            <Image
              src="https://api.producthunt.com/widgets/embed-image/v1/product_review.svg?product_id=1267912&theme=light"
              alt="SignWorkflow on Product Hunt"
              width={200}
              height={54}
              className="h-8 w-auto"
            />
          </a>
        </div>
      </div>
    </div>
  );
}
