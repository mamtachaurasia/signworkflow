import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { isIP } from 'node:net';

type ResolvedWebhookDestination = {
  url: URL;
  address: string;
  family: 4 | 6;
};

export function isPrivateIpv4(address: string): boolean {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [first, second] = parts;
  return first === 0
    || first === 10
    || first === 127
    || (first === 100 && second >= 64 && second <= 127)
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 0)
    || (first === 192 && second === 168)
    || (first === 198 && (second === 18 || second === 19))
    || (first === 198 && second === 51 && parts[2] === 100)
    || (first === 203 && second === 0 && parts[2] === 113)
    || first >= 224;
}

export function isPrivateAddress(address: string): boolean {
  const normalized = address.toLowerCase().split('%')[0];
  if (isIP(normalized) === 4) return isPrivateIpv4(normalized);
  if (isIP(normalized) !== 6) return true;
  if (normalized === '::' || normalized === '::1') return true;
  const mappedIpv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (mappedIpv4) return isPrivateIpv4(mappedIpv4);
  // Public IPv6 unicast currently occupies 2000::/3. Reject ULA, link-local,
  // multicast, unspecified, and transition ranges instead of attempting to
  // enumerate every private/reserved prefix individually.
  if (!normalized.startsWith('2') && !normalized.startsWith('3')) return true;
  return normalized.startsWith('2001:db8:')
    || normalized === '2001:db8::'
    || normalized.startsWith('2001:0000:')
    || normalized.startsWith('2001:0:')
    || normalized.startsWith('2002:');
}

export async function resolveWebhookDestination(value: string): Promise<ResolvedWebhookDestination> {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('Webhook URLs must use HTTPS and cannot contain credentials.');
  }
  if (url.port && url.port !== '443') throw new Error('Webhook URLs must use the standard HTTPS port.');
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
    throw new Error('Webhook URLs must use a public hostname.');
  }
  const literalFamily = isIP(hostname);
  const addresses = literalFamily
    ? [{ address: hostname, family: literalFamily }]
    : await lookup(hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new Error('Webhook hostname must resolve only to public IP addresses.');
  }
  const selected = addresses[0];
  return { url, address: selected.address, family: selected.family as 4 | 6 };
}

export async function postWebhookJson(args: {
  url: string;
  headers: Record<string, string>;
  body: string;
  timeoutMs?: number;
}): Promise<{ statusCode: number; delivered: boolean }> {
  const destination = await resolveWebhookDestination(args.url);
  return new Promise((resolve, reject) => {
    const req = request({
      protocol: 'https:',
      hostname: destination.url.hostname.replace(/^\[|\]$/g, ''),
      port: 443,
      path: `${destination.url.pathname}${destination.url.search}`,
      method: 'POST',
      family: destination.family,
      headers: { ...args.headers, 'content-length': String(Buffer.byteLength(args.body)) },
      servername: isIP(destination.url.hostname.replace(/^\[|\]$/g, ''))
        ? undefined
        : destination.url.hostname,
      lookup: (_hostname, _options, callback) => callback(null, destination.address, destination.family),
    }, (response) => {
      response.resume();
      resolve({ statusCode: response.statusCode || 0, delivered: Boolean(response.statusCode && response.statusCode >= 200 && response.statusCode < 300) });
    });
    req.setTimeout(args.timeoutMs ?? 8000, () => req.destroy(new Error('Webhook delivery timed out.')));
    req.on('error', reject);
    req.end(args.body);
  });
}
