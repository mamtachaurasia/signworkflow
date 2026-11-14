import { test, expect } from '@playwright/test';

test('home page renders hero content', async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: /Sign Documents\s+Securely\s+& Instantly/i })
  ).toBeVisible();
  await expect(
    page.getByText(/Prepare documents, use AI to summarize, translate, explain clauses, and analyze risk/i)
  ).toBeVisible();
});
