import { describe, expect, it } from 'vitest';

import {
  isPrivateAddress,
  isPrivateIpv4,
  resolveWebhookDestination,
} from '@/lib/webhook-url';

describe('webhook destination validation', () => {
  it.each([
    '0.0.0.0',
    '10.1.2.3',
    '127.0.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '192.168.1.1',
    '198.51.100.10',
    '203.0.113.10',
    '224.0.0.1',
  ])('rejects non-public IPv4 address %s', (address) => {
    expect(isPrivateIpv4(address)).toBe(true);
  });

  it.each(['::', '::1', 'fc00::1', 'fe80::1', 'ff02::1', '2001:db8::1', '2002:7f00:1::'])
    ('rejects non-public IPv6 address %s', (address) => {
      expect(isPrivateAddress(address)).toBe(true);
    });

  it('accepts public IP addresses', () => {
    expect(isPrivateIpv4('8.8.8.8')).toBe(false);
    expect(isPrivateAddress('2606:4700:4700::1111')).toBe(false);
  });

  it('rejects private literals, credentials, non-HTTPS URLs, and custom ports', async () => {
    await expect(resolveWebhookDestination('https://127.0.0.1/hook')).rejects.toThrow(/public IP/i);
    await expect(resolveWebhookDestination('https://user:pass@example.com/hook')).rejects.toThrow(/credentials/i);
    await expect(resolveWebhookDestination('http://8.8.8.8/hook')).rejects.toThrow(/HTTPS/i);
    await expect(resolveWebhookDestination('https://8.8.8.8:8443/hook')).rejects.toThrow(/standard HTTPS port/i);
  });

  it('accepts a public HTTPS literal without performing a DNS lookup', async () => {
    const destination = await resolveWebhookDestination('https://8.8.8.8/webhook?source=test');
    expect(destination.address).toBe('8.8.8.8');
    expect(destination.family).toBe(4);
    expect(destination.url.pathname).toBe('/webhook');
  });
});
