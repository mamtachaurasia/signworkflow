import { isIP } from 'node:net';

type ParsedCidr = {
  address: Uint8Array;
  prefixLength: number;
  version: 4 | 6;
};

const MAX_ALLOWED_IP_CIDRS = 20;

function parseIpv4(address: string): Uint8Array | null {
  const parts = address.split('.');
  if (parts.length !== 4) return null;

  const bytes = new Uint8Array(4);
  for (const [index, part] of parts.entries()) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const octet = Number(part);
    if (octet < 0 || octet > 255) return null;
    bytes[index] = octet;
  }
  return bytes;
}

function parseIpv6(address: string): Uint8Array | null {
  if (address.split('::').length > 2) return null;
  const [leftRaw, rightRaw] = address.split('::');
  const left = leftRaw ? leftRaw.split(':') : [];
  const right = rightRaw ? rightRaw.split(':') : [];
  const groups = [...left, ...right];
  const ipv4Group = groups.findIndex((group) => group.includes('.'));

  if (ipv4Group !== -1) {
    if (ipv4Group !== groups.length - 1) return null;
    const ipv4 = parseIpv4(groups[ipv4Group]);
    if (ipv4 === null) return null;
    groups.splice(
      ipv4Group,
      1,
      ((ipv4[0] << 8) + ipv4[1]).toString(16),
      ((ipv4[2] << 8) + ipv4[3]).toString(16)
    );
  }

  if (address.includes('::')) {
    const omittedGroups = 8 - groups.length;
    if (omittedGroups < 1) return null;
    groups.splice(left.length, 0, ...Array(omittedGroups).fill('0'));
  }
  if (groups.length !== 8) return null;

  const bytes = new Uint8Array(16);
  for (const [index, group] of groups.entries()) {
    if (!/^[0-9a-f]{1,4}$/i.test(group)) return null;
    const value = Number.parseInt(group, 16);
    bytes[index * 2] = value >> 8;
    bytes[index * 2 + 1] = value & 0xff;
  }
  return bytes;
}

function parseAddress(address: string, version: 4 | 6): Uint8Array | null {
  return version === 4 ? parseIpv4(address) : parseIpv6(address);
}

function parseCidr(value: string): ParsedCidr | null {
  const candidate = value.trim();
  if (!candidate || candidate.split('/').length > 2) return null;
  const [address, prefixRaw] = candidate.split('/');
  const detectedVersion = isIP(address);
  if (detectedVersion !== 4 && detectedVersion !== 6) return null;

  const version = detectedVersion as 4 | 6;
  const width = version === 4 ? 32 : 128;
  if (prefixRaw !== undefined && !/^\d+$/.test(prefixRaw)) return null;
  const prefixLength = prefixRaw === undefined ? width : Number(prefixRaw);
  if (!Number.isInteger(prefixLength) || prefixLength < 0 || prefixLength > width) return null;

  const parsedAddress = parseAddress(address, version);
  if (parsedAddress === null) return null;
  return { address: parsedAddress, prefixLength, version };
}

/**
 * Validates user-entered CIDRs while preserving their familiar spelling for
 * display. A bare address is valid and means a single host (/32 or /128).
 */
export function normalizeAllowedIpCidrs(values: string[]): string[] | null {
  if (values.length > MAX_ALLOWED_IP_CIDRS) return null;
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const value of values) {
    const candidate = value.trim();
    if (!parseCidr(candidate)) return null;
    const key = candidate.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      normalized.push(candidate);
    }
  }
  return normalized;
}

export function isIpAllowedByCidrs(clientIp: string, cidrs: string[] | null | undefined): boolean {
  if (!cidrs || cidrs.length === 0) return true;
  const version = isIP(clientIp);
  if (version !== 4 && version !== 6) return false;
  const parsedIp = parseAddress(clientIp, version as 4 | 6);
  if (parsedIp === null) return false;

  return cidrs.some((cidr) => {
    const parsedCidr = parseCidr(cidr);
    if (!parsedCidr || parsedCidr.version !== version) return false;
    const fullBytes = Math.floor(parsedCidr.prefixLength / 8);
    const remainingBits = parsedCidr.prefixLength % 8;
    for (let index = 0; index < fullBytes; index += 1) {
      if (parsedIp[index] !== parsedCidr.address[index]) return false;
    }
    if (remainingBits === 0) return true;
    const mask = (0xff << (8 - remainingBits)) & 0xff;
    return (parsedIp[fullBytes] & mask) === (parsedCidr.address[fullBytes] & mask);
  });
}
