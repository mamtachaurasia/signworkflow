import { expect, type Page, test } from '@playwright/test';

async function openPricingWithCountry(page: Page, country: string) {
  await page.setExtraHTTPHeaders({
    'x-vercel-ip-country': country,
  });
  await page.goto('/pricing');
  await expect(page.getByRole('heading', { name: /Simple, Transparent Pricing/i })).toBeVisible();
}

test('pricing shows INR for India IP country', async ({ page }) => {
  await openPricingWithCountry(page, 'IN');

  await expect(page.getByText('₹499').first()).toBeVisible();
  await expect(page.getByText('$5').first()).toHaveCount(0);

  const market = await page.evaluate(async () => {
    const response = await fetch('/api/billing-market', { cache: 'no-store' });
    return response.json() as Promise<{ billingMarket: string }>;
  });

  expect(market.billingMarket).toBe('india');
});

test('pricing defaults to USD when no IP country signal is available', async ({ page }) => {
  await page.goto('/pricing');
  await expect(page.getByRole('heading', { name: /Simple, Transparent Pricing/i })).toBeVisible();

  await expect(page.getByText('$5').first()).toBeVisible();
  await expect(page.getByText('₹499').first()).toHaveCount(0);

  const market = await page.evaluate(async () => {
    const response = await fetch('/api/billing-market', { cache: 'no-store' });
    return response.json() as Promise<{ billingMarket: string }>;
  });

  expect(market.billingMarket).toBe('international');
});

test('pricing shows USD for non-India IP country', async ({ page }) => {
  await openPricingWithCountry(page, 'US');

  await expect(page.getByText('$5').first()).toBeVisible();
  await expect(page.getByText('₹499').first()).toHaveCount(0);

  const market = await page.evaluate(async () => {
    const response = await fetch('/api/billing-market', { cache: 'no-store' });
    return response.json() as Promise<{ billingMarket: string }>;
  });

  expect(market.billingMarket).toBe('international');
});
