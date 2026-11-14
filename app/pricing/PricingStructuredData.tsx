import { PRICING_PLANS, getPlanChargeValue } from '@/lib/pricing';
import { getCanonicalUrl, SITE_NAME } from '@/lib/site';

type PricingFaq = {
  q: string;
  a: string;
};

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export default function PricingStructuredData({ faqs }: { faqs: PricingFaq[] }) {
  const pricingUrl = getCanonicalUrl('/pricing');
  const paidPlans = PRICING_PLANS.filter(
    (plan) =>
      !plan.isCustom &&
      plan.id !== 'trial' &&
      plan.prices.international.monthly !== null &&
      plan.prices.international.annually !== null
  );

  const schema = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Home',
            item: getCanonicalUrl('/'),
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'Pricing',
            item: pricingUrl,
          },
        ],
      },
      {
        '@type': 'FAQPage',
        mainEntity: faqs.map((faq) => ({
          '@type': 'Question',
          name: normalizeText(faq.q),
          acceptedAnswer: {
            '@type': 'Answer',
            text: normalizeText(faq.a),
          },
        })),
      },
      ...paidPlans.map((plan) => ({
        '@type': 'Product',
        name: `${SITE_NAME} ${plan.name}`,
        description: normalizeText(plan.description || plan.tagline),
        category: 'Electronic signature software subscription',
        brand: {
          '@type': 'Brand',
          name: SITE_NAME,
        },
        offers: [
          {
            '@type': 'Offer',
            priceCurrency: 'USD',
            price: String(plan.prices.international.monthly),
            availability: 'https://schema.org/InStock',
            url: `${pricingUrl}#${plan.id}`,
            description: `${plan.name} monthly international subscription billed per user.`,
          },
          {
            '@type': 'Offer',
            priceCurrency: 'USD',
            price: String(getPlanChargeValue(plan, 'annually', 'international')),
            availability: 'https://schema.org/InStock',
            url: `${pricingUrl}#${plan.id}`,
            description: `${plan.name} annual international subscription billed per user per year.`,
          },
          {
            '@type': 'Offer',
            priceCurrency: 'INR',
            price: String(plan.prices.india.monthly),
            availability: 'https://schema.org/InStock',
            url: `${pricingUrl}#${plan.id}`,
            description: `${plan.name} monthly India subscription billed per user.`,
          },
          {
            '@type': 'Offer',
            priceCurrency: 'INR',
            price: String(getPlanChargeValue(plan, 'annually', 'india')),
            availability: 'https://schema.org/InStock',
            url: `${pricingUrl}#${plan.id}`,
            description: `${plan.name} annual India subscription billed per user per year.`,
          },
        ],
      })),
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}
