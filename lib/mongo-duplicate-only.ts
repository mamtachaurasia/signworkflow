/** Unordered batches can report duplicates alongside real failures. Only a
 * duplicate-only result proves every intended row already exists or was saved. */
export function isDuplicateKeyOnly(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const value = error as {
    code?: number;
    writeErrors?: Array<{ code?: number }>;
    writeConcernErrors?: unknown[];
    writeConcernError?: unknown;
    mongoose?: { validationErrors?: unknown[] };
  };
  if (value.writeConcernError || value.writeConcernErrors?.length || value.mongoose?.validationErrors?.length) return false;
  if (value.writeErrors?.length) return value.writeErrors.every((entry) => entry.code === 11000);
  return value.code === 11000;
}
