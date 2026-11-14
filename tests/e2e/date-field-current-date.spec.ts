
import { test, expect } from '@playwright/test';

test.describe('Date Field', () => {
  test('should have the current date when dropped', async ({ page }, testInfo) => {
    testInfo.slow();

    await page.goto('/e2e/builder-preview');
    await page.waitForLoadState('networkidle');

    const meTab = page.getByText('Me (Fill now)');
    await meTab.evaluate((element: HTMLElement) => element.click());
    const source = page.locator('[data-testid="Date-tool"]');
    const target = page.locator('#dropzone .react-pdf__Page__canvas').first();
    await expect(source).toBeVisible({ timeout: 15_000 });
    await expect(target).toBeVisible({ timeout: 15_000 });
    const sourceBox = await source.boundingBox();
    const targetBox = await target.boundingBox();

    expect(sourceBox).not.toBeNull();
    expect(targetBox).not.toBeNull();

    await page.mouse.move(
      sourceBox!.x + sourceBox!.width / 2,
      sourceBox!.y + sourceBox!.height / 2
    );
    await page.mouse.down();
    await page.mouse.move(
      targetBox!.x + targetBox!.width / 2,
      targetBox!.y + targetBox!.height / 2,
      { steps: 12 }
    );
    await page.mouse.up();
    await target.click({ position: { x: targetBox!.width / 2, y: targetBox!.height / 2 } });

    const datePicker = page.getByPlaceholder('Select dates');
    await expect(datePicker).toBeVisible();

    // Get the current date in the format displayed by the date picker
    const today = new Date();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const year = today.getFullYear();
    const formattedDate = `${month}/${day}/${year}`;

    // Check if the date picker has the current date
    await expect(datePicker).toHaveValue(formattedDate, { timeout: 15000 });
  });
});
    
