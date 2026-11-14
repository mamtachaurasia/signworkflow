import { expect, test } from '@playwright/test';

function extractCookies(setCookieHeaders: string[]) {
  return setCookieHeaders
    .map((header) => {
      const [pair] = header.split(';');
      const [name, ...valueParts] = pair.split('=');
      const value = valueParts.join('=');
      if (!name || !value) return null;
      return { name, value, url: 'http://127.0.0.1:3100' };
    })
    .filter((cookie): cookie is { name: string; value: string; url: string } => Boolean(cookie));
}

test('revisiting the dashboard reuses unchanged content without another list request or loading flash', async ({ page, request }) => {
  test.setTimeout(60_000);

  const uniqueId = Date.now();
  const email = `dashboard-revisit.${uniqueId}@example.com`;
  const password = 'TestPass123!';

  const registerResponse = await request.post('/api/auth/register', {
    timeout: 30_000,
    data: { email, password, name: 'Dashboard Revisit Tester' },
  });
  expect(registerResponse.ok()).toBeTruthy();

  const loginResponse = await request.post('/api/auth/login', {
    timeout: 30_000,
    data: { email, password },
  });
  expect(loginResponse.ok()).toBeTruthy();

  const cookies = extractCookies(
    loginResponse
      .headersArray()
      .filter((header) => header.name.toLowerCase() === 'set-cookie')
      .map((header) => header.value)
  );
  await page.context().addCookies(cookies);

  let documentListRequests = 0;
  page.on('request', (outgoingRequest) => {
    if (new URL(outgoingRequest.url()).pathname === '/api/documents/list') {
      documentListRequests += 1;
    }
  });

  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Start a document' })).toBeVisible();
  await expect.poll(() => documentListRequests).toBe(1);

  await page.getByRole('button', { name: 'My Account' }).click();
  await expect(page).toHaveURL(/\/dashboard\/account\/profile/);
  await expect(page.getByRole('heading', { name: 'Your Profile' })).toBeVisible();

  await page.evaluate(() => {
    const revisitWindow = window as typeof window & {
      __dashboardLoadingFlashSeen?: boolean;
      __dashboardLoadingObserver?: MutationObserver;
    };
    revisitWindow.__dashboardLoadingFlashSeen = false;
    revisitWindow.__dashboardLoadingObserver?.disconnect();
    revisitWindow.__dashboardLoadingObserver = new MutationObserver(() => {
      if (document.querySelector('[aria-label="Loading documents"]')) {
        revisitWindow.__dashboardLoadingFlashSeen = true;
      }
    });
    revisitWindow.__dashboardLoadingObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  });

  await page.goBack();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: 'Start a document' })).toBeVisible();
  await page.waitForTimeout(250);

  expect(documentListRequests).toBe(1);
  expect(
    await page.evaluate(() =>
      Boolean((window as typeof window & { __dashboardLoadingFlashSeen?: boolean }).__dashboardLoadingFlashSeen)
    )
  ).toBe(false);
});
