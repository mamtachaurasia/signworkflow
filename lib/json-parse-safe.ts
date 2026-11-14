/**
 * Parse JSON and throw error with details if invalid
 * Useful for API endpoints where malformed JSON should return 400
 */
export function parseJsonOrThrow<T>(data: unknown, fieldName: string): T {
  if (!data) {
    throw new Error(`${fieldName} is required`);
  }

  if (typeof data !== 'string') {
    throw new Error(`${fieldName} must be a string`);
  }

  try {
    return JSON.parse(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Invalid JSON in ${fieldName}: ${message}`);
  }
}
