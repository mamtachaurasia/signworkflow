import type { Metadata } from 'next';
import Script from 'next/script';
import GoogleAnalytics from '@/app/GoogleAnalytics';
import { CookieBanner } from '@/components/cookie/CookieBanner';
import { CookiePreferencesModal } from '@/components/cookie/CookiePreferencesModal';
import LayoutWrapper from '@/components/LayoutWrapper';
import SiteStructuredData from '@/app/SiteStructuredData';
import './globals.css';
import { Toaster } from "react-hot-toast";
import { cn } from "@/lib/utils";
import { CookieConsentProvider } from '@/contexts/CookieConsentContext';
import { getConsentModeInitializationScript } from '@/lib/gtag';
import {
  SITE_DESCRIPTION,
  SITE_KEYWORDS,
  SITE_NAME,
  SITE_OG_IMAGE_PATH,
  SITE_SOCIAL_IMAGE_HEIGHT,
  SITE_SOCIAL_IMAGE_TYPE,
  SITE_SOCIAL_IMAGE_WIDTH,
  SITE_TWITTER_IMAGE_PATH,
  SITE_TITLE,
  SITE_URL,
} from '@/lib/site';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: SITE_NAME,
  title: {
    default: SITE_TITLE,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: SITE_KEYWORDS,
  alternates: {
    canonical: '/',
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: '/favicon.ico',
  },
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: '/',
    images: [
      {
        url: SITE_OG_IMAGE_PATH,
        alt: `${SITE_NAME} contract lifecycle management platform`,
        width: SITE_SOCIAL_IMAGE_WIDTH,
        height: SITE_SOCIAL_IMAGE_HEIGHT,
        type: SITE_SOCIAL_IMAGE_TYPE,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [
      {
        url: SITE_TWITTER_IMAGE_PATH,
        alt: `${SITE_NAME} contract lifecycle management platform`,
        width: SITE_SOCIAL_IMAGE_WIDTH,
        height: SITE_SOCIAL_IMAGE_HEIGHT,
        type: SITE_SOCIAL_IMAGE_TYPE,
      },
    ],
  },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={cn("font-sans overflow-hidden")} data-scroll-behavior="smooth">
      <head>
        <link
          rel="preload"
          href="/fonts/PlusJakartaSans.woff2?v=732533ac"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body>
        <Script id="google-consent-mode" strategy="beforeInteractive">
          {getConsentModeInitializationScript()}
        </Script>
        <GoogleAnalytics />
        <CookieConsentProvider>
          <SiteStructuredData />
          <LayoutWrapper>{children}</LayoutWrapper>
          <CookieBanner />
          <CookiePreferencesModal />
          {/* Global toaster here */}
          <Toaster
            position="top-center"
            containerStyle={{ zIndex: 1000003 }}
            toastOptions={{
              className: "rounded-xl shadow-lg mt-24",
              style: {
                background: "#fff",
                color: "#333",
              },
              success: {
                style: { background: "#10B981", color: "white" }, 
              },
              error: {
                style: { background: "#EF4444", color: "white" },  
              },
            }}
          />
        </CookieConsentProvider>
      </body>
    </html>
  );
}
