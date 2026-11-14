const TEMPLATE_VARIABLE_PATTERN = /\{\{[^{}\r\n]+\}\}/g;
const NEW_SMART_VARIABLE_PATTERN = /^\{\{([a-z][a-z0-9_]{0,63})\}\}$/;

export type WritingPlaceholderIntegrityOptions = {
  allowNewVariables?: boolean;
};

function countPlaceholders(placeholders: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const placeholder of placeholders) {
    counts.set(placeholder, (counts.get(placeholder) || 0) + 1);
  }
  return counts;
}

function expandCountDifference(
  left: ReadonlyMap<string, number>,
  right: ReadonlyMap<string, number>
): string[] {
  const difference: string[] = [];
  for (const [placeholder, count] of left) {
    const delta = count - (right.get(placeholder) || 0);
    for (let index = 0; index < delta; index += 1) {
      difference.push(placeholder);
    }
  }
  return difference;
}

export class WritingAssistantInputError extends Error {
  readonly code = 'INVALID_WRITING_INPUT';

  constructor(message: string) {
    super(message);
    this.name = 'WritingAssistantInputError';
  }
}

export class WritingPlaceholderIntegrityError extends Error {
  readonly code = 'WRITING_PLACEHOLDER_INTEGRITY_FAILED';
  readonly missing: readonly string[];
  readonly unexpected: readonly string[];

  constructor(missing: readonly string[], unexpected: readonly string[]) {
    super('The AI suggestion did not preserve template variable placeholders exactly.');
    this.name = 'WritingPlaceholderIntegrityError';
    this.missing = missing;
    this.unexpected = unexpected;
  }
}

export class WritingAssistantProviderError extends Error {
  readonly code = 'WRITING_PROVIDER_FAILED';

  constructor(cause?: unknown) {
    super('The configured AI provider could not generate a writing suggestion.');
    this.name = 'WritingAssistantProviderError';
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

export function extractWritingPlaceholders(text: string): string[] {
  return String(text || '').match(TEMPLATE_VARIABLE_PATTERN) || [];
}

function normalizeNewSmartVariableKey(value: string): string | null {
  const normalized = value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!normalized) return null;

  const prefixed = /^[a-z]/.test(normalized)
    ? normalized
    : `detail_${normalized}`;
  return prefixed.slice(0, 64).replace(/_+$/g, '') || null;
}

/**
 * Convert new, human-readable AI placeholder names into the safe keys used by
 * Smart variables. Source placeholders are always preserved exactly.
 */
export function normalizeNewWritingSmartVariables(source: string, suggestion: string): string {
  const existing = new Set(extractWritingPlaceholders(source));

  return String(suggestion || '').replace(TEMPLATE_VARIABLE_PATTERN, (placeholder) => {
    if (existing.has(placeholder)) return placeholder;
    const key = normalizeNewSmartVariableKey(placeholder.slice(2, -2));
    const normalizedPlaceholder = key ? `{{${key}}}` : null;

    // A provider may reformat an existing {{seller_name}} as {{Seller Name}}.
    // Do not normalize that back into the protected source placeholder: it must
    // remain visible to the integrity check as a changed existing variable.
    if (normalizedPlaceholder && existing.has(normalizedPlaceholder)) return placeholder;

    return normalizedPlaceholder || placeholder;
  });
}

export function getNewWritingSmartVariableKeys(source: string, suggestion: string): string[] {
  const existing = new Set(extractWritingPlaceholders(source));
  const keys = new Set<string>();

  for (const placeholder of extractWritingPlaceholders(suggestion)) {
    if (existing.has(placeholder)) continue;
    const match = placeholder.match(NEW_SMART_VARIABLE_PATTERN);
    if (match) keys.add(match[1]);
  }

  return [...keys];
}

export function assertWritingPlaceholderIntegrity(
  source: string,
  suggestion: string,
  options: WritingPlaceholderIntegrityOptions = {}
): void {
  const sourceCounts = countPlaceholders(extractWritingPlaceholders(source));
  const suggestionCounts = countPlaceholders(extractWritingPlaceholders(suggestion));
  const missing = expandCountDifference(sourceCounts, suggestionCounts);
  const unexpected = expandCountDifference(suggestionCounts, sourceCounts);
  const disallowedUnexpected = options.allowNewVariables
    ? unexpected.filter((placeholder) => !NEW_SMART_VARIABLE_PATTERN.test(placeholder) || sourceCounts.has(placeholder))
    : unexpected;

  if (missing.length > 0 || disallowedUnexpected.length > 0) {
    throw new WritingPlaceholderIntegrityError(missing, unexpected);
  }
}
