import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { SITE_OG_IMAGE_PATH, SITE_SOCIAL_IMAGE_HEIGHT, SITE_SOCIAL_IMAGE_TYPE, SITE_SOCIAL_IMAGE_WIDTH } from '@/lib/site';

export const metadata: Metadata = {
  title: 'About Us',
  description:
    'SignWorkflow is a workspace-first e-signature platform for legal, HR, finance, and operations teams. Learn about the company, platform capabilities, and approach to secure document workflows.',
  alternates: {
    canonical: '/about',
  },
  openGraph: {
    title: 'About SignWorkflow',
    type: 'website',
    url: '/about',
    siteName: 'SignWorkflow',
    description:
      'SignWorkflow is a workspace-first e-signature platform for legal, HR, finance, and operations teams. Learn about the company, platform capabilities, and approach to secure document workflows.',
    images: [
      {
        url: SITE_OG_IMAGE_PATH,
        alt: 'About SignWorkflow',
        width: SITE_SOCIAL_IMAGE_WIDTH,
        height: SITE_SOCIAL_IMAGE_HEIGHT,
        type: SITE_SOCIAL_IMAGE_TYPE,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'About SignWorkflow',
    description:
      'SignWorkflow is a workspace-first e-signature platform for legal, HR, finance, and operations teams.',
    images: [SITE_OG_IMAGE_PATH],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function AboutLayout({ children }: { children: ReactNode }) {
  return children;
}
