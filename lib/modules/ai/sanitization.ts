const MAX_TEXT_LENGTH = 100_000;
const CONTROL_CHARS_REGEX = /[\x00-\x1F\x7F]/g;
const WRITING_CONTROL_CHARS_REGEX = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;
const PROMPT_INJECTION_PATTERNS = [
  /system:\s*ignore/i,
  /disregard.*instructions/i,
  /do not.*follow/i,
  /forget.*system/i,
  /override.*constraints/i,
  /bypass.*safety/i,
];

export function sanitizeInput(text: string): string {
  if (!text) return '';

  let sanitized = String(text);

  sanitized = sanitized.replace(CONTROL_CHARS_REGEX, '');

  sanitized = sanitized.replace(/\s+/g, ' ').trim();

  if (sanitized.length > MAX_TEXT_LENGTH) {
    sanitized = sanitized.substring(0, MAX_TEXT_LENGTH);
  }

  return sanitized;
}

/**
 * Sanitizes editable agreement text without flattening its paragraphs or list lines.
 * Other AI actions retain the existing whitespace-normalizing behavior above.
 */
export function sanitizeWritingInput(text: string): string {
  if (!text) return '';

  let sanitized = String(text)
    .replace(/\r\n?/g, '\n')
    .replace(WRITING_CONTROL_CHARS_REGEX, '');

  if (sanitized.length > MAX_TEXT_LENGTH) {
    sanitized = sanitized.substring(0, MAX_TEXT_LENGTH);
  }

  return sanitized.trim();
}

export function detectPromptInjection(text: string): boolean {
  const lowerText = text.toLowerCase();
  return PROMPT_INJECTION_PATTERNS.some((pattern) => pattern.test(lowerText));
}

export function validateUserInput(text: string): { valid: boolean; error?: string } {
  if (!text) {
    return { valid: false, error: 'Text cannot be empty' };
  }

  if (text.length < 5) {
    return { valid: false, error: 'Text must be at least 5 characters' };
  }

  if (text.length > MAX_TEXT_LENGTH) {
    return { valid: false, error: `Text exceeds maximum length of ${MAX_TEXT_LENGTH}` };
  }

  if (detectPromptInjection(text)) {
    return { valid: false, error: 'Input contains suspicious patterns' };
  }

  return { valid: true };
}

export function escapePromptText(text: string): string {
  const sanitized = sanitizeInput(text);

  return sanitized
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, ' ')
    .replace(/\r/g, '');
}
