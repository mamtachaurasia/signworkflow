import { test, expect } from '@playwright/test';

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

test('personal users see the organization-required message on admin governance', async ({ page, request }) => {
  test.setTimeout(60_000);

  const uniqueId = Date.now();
  const email = `admin-governance.${uniqueId}@example.com`;
  const password = 'TestPass123!';

  const registerRes = await request.post('/api/auth/register', {
    timeout: 30000,
    data: {
      email,
      password,
      name: 'Governance Tester',
    },
  });
  expect(registerRes.ok()).toBeTruthy();

  const loginRes = await request.post('/api/auth/login', {
    timeout: 30000,
    data: { email, password },
  });
  expect(loginRes.ok()).toBeTruthy();

  const setCookieHeaders = loginRes
    .headersArray()
    .filter((header) => header.name.toLowerCase() === 'set-cookie')
    .map((header) => header.value);

  const cookies = extractCookies(setCookieHeaders);
  await page.context().addCookies(cookies);

  await page.goto('/account/admin-governance');
  await expect
    .poll(async () => {
      const noOrgVisible = await page.getByRole('heading', { name: /No active workspace access/i }).isVisible().catch(() => false);
      const noAccessVisible = await page.getByText(/You do not have access to governance controls/i).isVisible().catch(() => false);
      return noOrgVisible || noAccessVisible;
    })
    .toBe(true);
});
