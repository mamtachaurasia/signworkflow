import { describe, expect, it } from 'vitest';

import { isIpAllowedByCidrs, normalizeAllowedIpCidrs } from '@/lib/ip-allowlist';

describe('API key IP allowlists', () => {
  it('accepts and deduplicates valid IPv4 and IPv6 CIDRs', () => {
    expect(normalizeAllowedIpCidrs(['203.0.113.0/24', '2001:db8::/32', '203.0.113.0/24'])).toEqual([
      '203.0.113.0/24',
      '2001:db8::/32',
    ]);
  });

  it('rejects malformed addresses and prefixes', () => {
    expect(normalizeAllowedIpCidrs(['203.0.113.0/99'])).toBeNull();
    expect(normalizeAllowedIpCidrs(['not-an-ip'])).toBeNull();
  });

  it.each(['0x10', '1e1', '+16', '-0', '16.0', ' 16', '\t16', ''])('rejects non-decimal prefix notation %j', (prefix) => {
    expect(normalizeAllowedIpCidrs([`10.0.0.0/${prefix}`])).toBeNull();
    expect(normalizeAllowedIpCidrs([`2001:db8::/${prefix}`])).toBeNull();
    expect(isIpAllowedByCidrs('10.0.0.1', [`10.0.0.0/${prefix}`])).toBe(false);
    expect(isIpAllowedByCidrs('2001:db8::1', [`2001:db8::/${prefix}`])).toBe(false);
  });

  it('accepts decimal boundary prefixes and bare host addresses', () => {
    const cidrs = ['0.0.0.0/0', '203.0.113.1/32', '::/0', '2001:db8::1/128', '203.0.113.1', '2001:db8::1'];
    expect(normalizeAllowedIpCidrs(cidrs)).toEqual(cidrs);
  });

  it('matches an address only within an allowed CIDR', () => {
    expect(isIpAllowedByCidrs('203.0.113.42', ['203.0.113.0/24'])).toBe(true);
    expect(isIpAllowedByCidrs('203.0.114.42', ['203.0.113.0/24'])).toBe(false);
    expect(isIpAllowedByCidrs('2001:db8:1::4', ['2001:db8::/32'])).toBe(true);
    expect(isIpAllowedByCidrs('2001:db9::4', ['2001:db8::/32'])).toBe(false);
  });

  it('does not bypass a configured list when no verified client IP exists', () => {
    expect(isIpAllowedByCidrs('unknown', ['203.0.113.0/24'])).toBe(false);
    expect(isIpAllowedByCidrs('unknown', [])).toBe(true);
  });
});
