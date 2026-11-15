import { createPublicKey, generateKeyPairSync, randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import jwt, { JwtPayload, SignOptions } from 'jsonwebtoken';

export interface AccessTokenPayload {
  userId: string;
  role: string;
  tokenVersion: number;
  sessionId: string;
  authTime: number;
  type: 'access';
}

export interface RefreshTokenPayload {
  userId: string;
  tokenVersion: number;
  sessionId: string;
  authTime: number;
  nonce: string;
  type: 'refresh';
}

const ACCESS_TOKEN_TTL = process.env.ACCESS_TOKEN_TTL || '15m';
const REFRESH_TOKEN_TTL = process.env.REFRESH_TOKEN_TTL || '30d';
const JWT_ISSUER = process.env.JWT_ISSUER || 'contract-esign';
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || 'contract-esign-app';
const FALLBACK_KEY_FILE = path.join('/tmp', '.signworkflow-jwt-keys.json');

interface RuntimeKeyPair {
  privateKey: string;
  publicKey: string;
}

const globalForJwt = globalThis as typeof globalThis & {
  __signworkflowRuntimeJwtKeys?: RuntimeKeyPair;
  __signworkflowWarnedMissingJwtKeys?: boolean;
};

class InvalidPemKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidPemKeyError';
  }
}

const keyCache = new Map<string, string>();

function normalizePem(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.includes('BEGIN')) {
    return trimmed.replace(/\\n/g, '\n');
  }

  const decoded = Buffer.from(trimmed, 'base64').toString('utf-8');
  if (decoded.includes('BEGIN')) {
    return decoded;
  }

  throw new InvalidPemKeyError('Unable to decode PEM key from environment variable.');
}

function readOptionalPemFromEnv(names: string[]): string | null {
  const cacheKey = names.join(',');
  if (keyCache.has(cacheKey)) {
    return keyCache.get(cacheKey)!;
  }

  for (const name of names) {
    const value = process.env[name];
    if (!value) continue;
    const key = normalizePem(value);
    keyCache.set(cacheKey, key);
    return key;
  }

  return null;
}

function isValidRuntimeKeyPair(candidate: unknown): candidate is RuntimeKeyPair {
  if (!candidate || typeof candidate !== 'object') {
    return false;
  }
  const maybe = candidate as Partial<RuntimeKeyPair>;
  return (
    typeof maybe.privateKey === 'string' &&
    maybe.privateKey.includes('BEGIN') &&
    typeof maybe.publicKey === 'string' &&
    maybe.publicKey.includes('BEGIN')
  );
}

function getOrCreateRuntimeKeyPair(): RuntimeKeyPair {
  if (globalForJwt.__signworkflowRuntimeJwtKeys) {
    return globalForJwt.__signworkflowRuntimeJwtKeys;
  }

  try {
    if (fs.existsSync(FALLBACK_KEY_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(FALLBACK_KEY_FILE, 'utf-8'));
      if (isValidRuntimeKeyPair(parsed)) {
        globalForJwt.__signworkflowRuntimeJwtKeys = parsed;
        return parsed;
      }
    }
  } catch {
    // Ignore unreadable fallback key file and generate a fresh keypair below.
  }

  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const generated: RuntimeKeyPair = { privateKey, publicKey };

  try {
    fs.writeFileSync(FALLBACK_KEY_FILE, JSON.stringify(generated), {
      mode: 0o600,
      flag: 'wx',
    });
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === 'EEXIST') {
      try {
        const existing = JSON.parse(fs.readFileSync(FALLBACK_KEY_FILE, 'utf-8'));
        if (isValidRuntimeKeyPair(existing)) {
          globalForJwt.__signworkflowRuntimeJwtKeys = existing;
          return existing;
        }
      } catch {
        // Fall through to in-memory generated pair.
      }
    }
  }

  if (!globalForJwt.__signworkflowWarnedMissingJwtKeys) {
    globalForJwt.__signworkflowWarnedMissingJwtKeys = true;
    console.warn(
      'JWT PEM env vars are not configured. Using runtime-generated RS256 keypair; configure JWT_PRIVATE_KEY and JWT_PUBLIC_KEY for multi-instance persistence.'
    );
  }

  globalForJwt.__signworkflowRuntimeJwtKeys = generated;
  return generated;
}

function derivePublicKeyFromPrivate(privateKey: string): string {
  return createPublicKey(privateKey).export({ type: 'spki', format: 'pem' }).toString();
}

function getAccessPrivateKey(): string {
  return (
    readOptionalPemFromEnv(['JWT_ACCESS_PRIVATE_KEY', 'JWT_PRIVATE_KEY']) ??
    getOrCreateRuntimeKeyPair().privateKey
  );
}

function getAccessPublicKey(): string {
  const fromEnv = readOptionalPemFromEnv(['JWT_ACCESS_PUBLIC_KEY', 'JWT_PUBLIC_KEY']);
  if (fromEnv) return fromEnv;

  const privateFromEnv = readOptionalPemFromEnv(['JWT_ACCESS_PRIVATE_KEY', 'JWT_PRIVATE_KEY']);
  if (privateFromEnv) {
    return derivePublicKeyFromPrivate(privateFromEnv);
  }

  return getOrCreateRuntimeKeyPair().publicKey;
}

function getRefreshPrivateKey(): string {
  return (
    readOptionalPemFromEnv(['JWT_REFRESH_PRIVATE_KEY', 'JWT_PRIVATE_KEY']) ??
    getOrCreateRuntimeKeyPair().privateKey
  );
}

function getRefreshPublicKey(): string {
  const fromEnv = readOptionalPemFromEnv(['JWT_REFRESH_PUBLIC_KEY', 'JWT_PUBLIC_KEY']);
  if (fromEnv) return fromEnv;

  const privateFromEnv = readOptionalPemFromEnv(['JWT_REFRESH_PRIVATE_KEY', 'JWT_PRIVATE_KEY']);
  if (privateFromEnv) {
    return derivePublicKeyFromPrivate(privateFromEnv);
  }

  return getOrCreateRuntimeKeyPair().publicKey;
}

export function isJwtConfigurationError(error: unknown): boolean {
  if (error instanceof InvalidPemKeyError) {
    return true;
  }
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message || '';
  return (
    message.includes('Missing JWT key material') ||
    message.includes('Unable to decode PEM key from environment variable')
  );
}

function verifyAndCoerce<T extends { type: string }>(
  token: string,
  publicKey: string,
  expectedType: T['type']
): T {
  const decoded = jwt.verify(token, publicKey, {
    algorithms: ['RS256'],
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  }) as JwtPayload & T;

  if (decoded.type !== expectedType) {
    throw new Error(`Invalid token type. Expected ${expectedType}.`);
  }

  return decoded as T;
}

function signToken(payload: object, privateKey: string, expiresIn: SignOptions['expiresIn']): string {
  return jwt.sign(payload, privateKey, {
    algorithm: 'RS256',
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    expiresIn,
    jwtid: randomUUID(),
  });
}

export function signAccessToken(payload: Omit<AccessTokenPayload, 'type'>): string {
  return signToken(
    {
      ...payload,
      type: 'access',
    },
    getAccessPrivateKey(),
    parseDurationToMs(ACCESS_TOKEN_TTL) / 1000
  );
}

export function signRefreshToken(payload: Omit<RefreshTokenPayload, 'type' | 'nonce'>): string {
  return signToken(
    {
      ...payload,
      nonce: randomUUID(),
      type: 'refresh',
    },
    getRefreshPrivateKey(),
    parseDurationToMs(REFRESH_TOKEN_TTL) / 1000
  );
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return verifyAndCoerce<AccessTokenPayload>(token, getAccessPublicKey(), 'access');
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return verifyAndCoerce<RefreshTokenPayload>(token, getRefreshPublicKey(), 'refresh');
}

export function getAccessTokenTtl(): string {
  return ACCESS_TOKEN_TTL;
}

function parseDurationToMs(duration: string): number {
  const normalized = duration.trim();
  const match = normalized.match(/^(\d+)(ms|s|m|h|d)$/i);
  if (!match) {
    const asNumber = Number(normalized);
    if (!Number.isNaN(asNumber) && asNumber > 0) {
      return asNumber * 1000;
    }
    throw new Error(`Invalid duration format: ${duration}`);
  }

  const value = Number(match[1]);
  const unit = match[2].toLowerCase();

  switch (unit) {
    case 'ms':
      return value;
    case 's':
      return value * 1000;
    case 'm':
      return value * 60 * 1000;
    case 'h':
      return value * 60 * 60 * 1000;
    case 'd':
      return value * 24 * 60 * 60 * 1000;
    default:
      throw new Error(`Unsupported duration unit: ${unit}`);
  }
}

export function getRefreshTokenExpiryDate(now = new Date()): Date {
  const ttlMs = parseDurationToMs(REFRESH_TOKEN_TTL);
  return new Date(now.getTime() + ttlMs);
}

