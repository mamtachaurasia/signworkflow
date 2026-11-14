import { expect, test } from '@playwright/test';

const conversionUnavailableMessage =
  'Word document conversion is temporarily unavailable. Please upload a PDF version of this document.';

test('DOCX conversion outage shows one clean upload error', async ({ page }) => {
  await page.route('**/api/documents/upload', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 750));
    await route.fulfill({
      status: 422,
      contentType: 'application/json',
      body: JSON.stringify({ message: conversionUnavailableMessage }),
    });
  });

  await page.goto('/e2e/upload');

  await page.locator('input[type="file"]').setInputFiles({
    name: 'quota.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: Buffer.from([0x50, 0x4b, 0x03, 0x04]),
  });

  await expect(page.getByText('Converting Word document to PDF...')).toBeVisible();
  await expect(page.getByText('This can take a few seconds. Keep this tab open.')).toBeVisible();
  await expect(page.getByText(conversionUnavailableMessage)).toBeVisible();
  await expect(page.getByText(conversionUnavailableMessage)).toHaveCount(1);
  await expect(page).toHaveURL(/\/e2e\/upload$/);
});
