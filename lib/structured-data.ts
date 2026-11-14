import {
  COMPANY,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TITLE,
  SITE_URL,
  getCanonicalUrl,
} from '@/lib/site';

type BreadcrumbItem = {
  name: string;
  url: string;
};

export type StructuredFaq = {
  question: string;
  answer: string;
};

function absoluteUrl(pathOrUrl: string): string {
  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
    return pathOrUrl;
  }

  return getCanonicalUrl(pathOrUrl);
}

export function buildSiteStructuredData() {
  const organizationId = `${SITE_URL}/#organization`;
  const websiteId = `${SITE_URL}/#website`;
  const softwareId = `${SITE_URL}/#software`;

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': organizationId,
        name: SITE_NAME,
        legalName: COMPANY.legalName,
        url: SITE_URL,
        logo: getCanonicalUrl('/SignWorkFlow_logo.svg'),
        address: {
          '@type': 'PostalAddress',
          streetAddress: COMPANY.hq.street,
          addressLocality: COMPANY.hq.city,
          addressRegion: COMPANY.hq.region,
          postalCode: COMPANY.hq.postalCode,
          addressCountry: COMPANY.hq.countryCode,
        },
        contactPoint: [
          {
            '@type': 'ContactPoint',
            contactType: 'sales',
            email: COMPANY.contact.sales,
            url: getCanonicalUrl('/contact'),
          },
          {
            '@type': 'ContactPoint',
            contactType: 'customer support',
            email: COMPANY.contact.support,
            url: getCanonicalUrl('/contact'),
          },
        ],
        sameAs: [COMPANY.social.linkedin],
      },
      {
        '@type': 'WebSite',
        '@id': websiteId,
        name: SITE_NAME,
        url: SITE_URL,
        description: SITE_DESCRIPTION,
        publisher: {
          '@id': organizationId,
        },
        potentialAction: {
          '@type': 'SearchAction',
          target: `${SITE_URL}/blog?search={search_term_string}`,
          'query-input': 'required name=search_term_string',
        },
      },
      {
        '@type': 'SoftwareApplication',
        '@id': softwareId,
        name: SITE_NAME,
        applicationCategory: 'BusinessApplication',
        applicationSubCategory: 'Electronic signature software',
        operatingSystem: 'Web',
        url: SITE_URL,
        description: SITE_DESCRIPTION,
        featureList: [
          'Electronic signature workflows',
          'AI document summaries and clause explanations',
          'Templates and bulk send',
          'Workspace roles and team controls',
          'Audit trails, retention policies, and legal holds',
        ],
        offers: {
          '@type': 'Offer',
          url: getCanonicalUrl('/pricing'),
          price: '0',
          priceCurrency: 'USD',
          category: 'Free trial',
        },
        publisher: {
          '@id': organizationId,
        },
      },
      {
        '@type': 'WebPage',
        '@id': `${SITE_URL}/#webpage`,
        url: SITE_URL,
        name: SITE_TITLE,
        description: SITE_DESCRIPTION,
        isPartOf: {
          '@id': websiteId,
        },
        about: {
          '@id': softwareId,
        },
      },
    ],
  };
}

export function buildBreadcrumbStructuredData(items: BreadcrumbItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.url),
    })),
  };
}

export function buildFaqStructuredData(faqs: StructuredFaq[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };
}

export function buildWebPageStructuredData({
  path,
  title,
  description,
  breadcrumbs,
}: {
  path: string;
  title: string;
  description: string;
  breadcrumbs?: BreadcrumbItem[];
}) {
  const url = absoluteUrl(path);

  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': `${url}#webpage`,
    url,
    name: title,
    description,
    isPartOf: {
      '@id': `${SITE_URL}/#website`,
    },
    breadcrumb: breadcrumbs?.length ? {
      '@id': `${url}#breadcrumb`,
    } : undefined,
  };
}

export function buildCollectionPageStructuredData({
  path,
  title,
  description,
  items,
}: {
  path: string;
  title: string;
  description: string;
  items: Array<{ name: string; url: string; description?: string }>;
}) {
  const url = absoluteUrl(path);

  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${url}#collection`,
    url,
    name: title,
    description,
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: items.map((item, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: item.name,
        url: absoluteUrl(item.url),
        description: item.description,
      })),
    },
  };
}

export function buildBlogPostingStructuredData({
  path,
  title,
  description,
  datePublished,
  author,
  image,
}: {
  path: string;
  title: string;
  description: string;
  datePublished?: string;
  author?: string;
  image?: string;
}) {
  const url = absoluteUrl(path);

  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: title,
    description,
    url,
    datePublished,
    dateModified: datePublished,
    image: image ? absoluteUrl(image) : undefined,
    author: author
      ? {
          '@type': 'Person',
          name: author,
        }
      : {
          '@type': 'Organization',
          name: SITE_NAME,
        },
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      logo: {
        '@type': 'ImageObject',
        url: getCanonicalUrl('/SignWorkFlow_logo.svg'),
      },
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `${url}#webpage`,
    },
  };
}
