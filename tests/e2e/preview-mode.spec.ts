import { expect, Locator, Page, test } from '@playwright/test';

async function openPreview(page: Page): Promise<Locator> {
  const modal = page.locator('.sender-preview-modal');
  await expect(modal).toBeVisible();
  return modal;
}

test.describe('Sender Preview', () => {
  test('preserves recipient text field values in direct preview mode', async ({ page }, testInfo) => {
    testInfo.slow();

    await page.goto('/e2e/preview-mode');

    const previewModal = await openPreview(page);
    const previewInputs = previewModal.getByPlaceholder('Enter text');

    await expect(previewInputs.first()).toBeVisible({ timeout: 15_000 });
    await expect(previewInputs).toHaveCount(2, { timeout: 15_000 });

    await previewInputs.nth(0).pressSequentially('alpha');
    await expect(previewInputs.nth(0)).toHaveValue('alpha');

    await previewInputs.nth(1).pressSequentially('beta');

    await expect(previewInputs.nth(0)).toHaveValue('alpha');
    await expect(previewInputs.nth(1)).toHaveValue('beta');
  });

  test('preserves recipient text field values from builder preview', async ({ page }, testInfo) => {
    testInfo.slow();

    await page.goto('/e2e/builder-preview');
    await expect(page.locator('button[title="Preview Document"]')).toBeVisible({ timeout: 15_000 });

    await page
      .locator('button[title="Preview Document"]')
      .evaluate((element: HTMLButtonElement) => element.click());

    const previewModal = await openPreview(page);
    const previewInputs = previewModal.getByPlaceholder('Enter text');

    await expect(previewInputs.first()).toBeVisible({ timeout: 15_000 });
    await expect(previewInputs).toHaveCount(2, { timeout: 15_000 });

    await previewInputs.nth(0).pressSequentially('alpha');
    await expect(previewInputs.nth(0)).toHaveValue('alpha');

    await previewInputs.nth(1).pressSequentially('beta');

    await expect(previewInputs.nth(0)).toHaveValue('alpha');
    await expect(previewInputs.nth(1)).toHaveValue('beta');
  });
});
