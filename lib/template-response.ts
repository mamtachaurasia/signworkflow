/**
 * Template artifact storage references are server-only.  Browser clients use
 * `templateFileUrl`, which is authorized and streams the current PDF, rather
 * than receiving bucket names or object keys in mutation responses.
 */
type TemplateLike = object & {
  toObject?: () => Record<string, unknown>;
};

export function toClientTemplate(template: TemplateLike): Record<string, unknown> {
  const value = typeof template.toObject === 'function'
    ? template.toObject()
    : { ...template };
  const clientTemplate = { ...value };
  delete clientTemplate.artifacts;
  delete clientTemplate.filePath;
  return clientTemplate;
}
