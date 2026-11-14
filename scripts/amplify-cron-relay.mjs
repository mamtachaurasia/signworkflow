const DEFAULT_TIMEOUT_MS = 20_000;

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function buildUrl(baseUrl, path) {
  const normalizedBase = baseUrl.replace(/\/$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

export async function handler(event = {}) {
  const baseUrl = requireEnv('BASE_URL');
  const cronSecret = requireEnv('CRON_SECRET');
  const path = typeof event.path === 'string' && event.path.trim() ? event.path.trim() : '';

  if (!path) {
    throw new Error('Event payload must include a non-empty "path" value.');
  }

  const method = typeof event.method === 'string' && event.method.trim()
    ? event.method.trim().toUpperCase()
    : 'GET';

  if (!['GET', 'POST'].includes(method)) {
    throw new Error(`Unsupported method "${method}". Use GET or POST.`);
  }

  const requestUrl = buildUrl(baseUrl, path);
  const timeoutMs = Number(process.env.CRON_RELAY_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  const requestInit = {
    method,
    headers: {
      'x-cron-secret': cronSecret,
      'content-type': 'application/json',
      'user-agent': 'contract-esign-amplify-cron-relay/1.0',
    },
    signal: AbortSignal.timeout(Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS),
  };

  if (method === 'POST') {
    requestInit.body = JSON.stringify(event.body ?? {});
  }

  const response = await fetch(requestUrl, requestInit);
  const rawText = await response.text();

  let parsedBody;
  try {
    parsedBody = rawText ? JSON.parse(rawText) : null;
  } catch {
    parsedBody = rawText || null;
  }

  if (!response.ok) {
    throw new Error(
      `Cron relay request failed (${response.status} ${response.statusText}) for ${requestUrl}: ${
        typeof parsedBody === 'string' ? parsedBody : JSON.stringify(parsedBody)
      }`
    );
  }

  return {
    ok: true,
    status: response.status,
    url: requestUrl,
    body: parsedBody,
  };
}
