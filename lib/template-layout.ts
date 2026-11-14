export type TemplateFieldLayoutStatus = 'current' | 'needs_review';

type TemplateLayoutLike = {
  fieldLayoutStatus?: unknown;
  layoutRevision?: unknown;
  fieldLayoutRevision?: unknown;
};

function normalizeRevision(value: unknown, fallback = 1): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? value
    : fallback;
}

/**
 * Legacy templates predate layout tracking. Treating an absent status as
 * current keeps them usable until their content is edited for the first time.
 */
export function getTemplateLayoutState(template: TemplateLayoutLike): {
  fieldLayoutStatus: TemplateFieldLayoutStatus;
  layoutRevision: number;
  fieldLayoutRevision: number;
} {
  const layoutRevision = normalizeRevision(template.layoutRevision);
  const fieldLayoutStatus: TemplateFieldLayoutStatus =
    template.fieldLayoutStatus === 'needs_review' ? 'needs_review' : 'current';

  if (fieldLayoutStatus === 'current') {
    return {
      fieldLayoutStatus,
      layoutRevision,
      fieldLayoutRevision: layoutRevision,
    };
  }

  return {
    fieldLayoutStatus,
    layoutRevision,
    fieldLayoutRevision: Math.min(
      normalizeRevision(template.fieldLayoutRevision, Math.max(1, layoutRevision - 1)),
      layoutRevision
    ),
  };
}
