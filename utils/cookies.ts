export function getCookieValue(name: string): string | null {
  if (typeof document === 'undefined') {
    return null;
  }

  const cookie = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));

  return cookie ? decodeURIComponent(cookie.split('=').slice(1).join('=')) : null;
}

/**
 * Adds the double-submit CSRF header for browser-initiated mutations. Keeping
 * this beside cookie access prevents template/document clients from each
 * reimplementing subtly different token handling.
 */
export function getCsrfHeaders(): Record<string, string> {
  const csrfToken = getCookieValue('csrf_token');
  return csrfToken ? { 'X-CSRF-Token': csrfToken } : {};
}
