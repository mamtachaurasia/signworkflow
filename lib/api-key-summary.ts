export type ApiKeySummary = {
  _id: unknown;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsedAt?: Date | null;
  createdAt: Date;
  expiresAt?: Date | null;
  allowedIpCidrs?: string[];
  maxRequestsPerMinute?: number;
  rotationIntervalDays?: number | null;
  rotationDueAt?: Date | null;
  rotatedAt?: Date | null;
  rotatedFrom?: unknown;
};

// Use an explicit allowlist even for projected queries: newly created Mongoose
// documents also contain secretHash and other private database fields.
export function serializeApiKey(key: ApiKeySummary) {
  return {
    id: String(key._id),
    name: key.name,
    prefix: key.prefix,
    scopes: key.scopes,
    lastUsedAt: key.lastUsedAt,
    createdAt: key.createdAt,
    expiresAt: key.expiresAt,
    allowedIpCidrs: key.allowedIpCidrs,
    maxRequestsPerMinute: key.maxRequestsPerMinute,
    rotationIntervalDays: key.rotationIntervalDays,
    rotationDueAt: key.rotationDueAt,
    rotatedAt: key.rotatedAt ?? null,
    rotatedFrom: key.rotatedFrom ? String(key.rotatedFrom) : null,
  };
}
