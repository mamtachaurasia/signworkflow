type TemplateReadinessField = {
  fieldOwner?: string | null;
  recipientId?: string | null;
};

type TemplateReadinessRole = {
  id?: string;
  role: 'signer' | 'approver' | 'viewer';
};

export interface TemplateReadinessInput {
  fields?: TemplateReadinessField[];
  roles?: TemplateReadinessRole[];
  fieldLayoutStatus?: 'current' | 'needs_review';
}

export interface TemplateReadiness {
  ready: boolean;
  missingRoles: boolean;
  missingFields: boolean;
  layoutNeedsReview: boolean;
  unassignedFields: number;
  orphanedFields: number;
  rolesMissingFields: number;
}

/**
 * Shared, side-effect-free readiness rules for the Template Builder UI.
 * Server-side publish validation can consume the same shape when template
 * revisions are introduced.
 */
export function evaluateTemplateReadiness(input: TemplateReadinessInput): TemplateReadiness {
  const fields = input.fields || [];
  const roles = input.roles || [];
  const recipientFields = fields.filter((field) => field.fieldOwner !== 'me');
  const roleIds = new Set(roles.map((role, index) => String(role.id || `role_${index + 1}`)));
  const assignedRoleIds = new Set(
    recipientFields
      .filter((field) => field.recipientId)
      .map((field) => String(field.recipientId))
  );

  const unassignedFields = recipientFields.filter((field) => !field.recipientId).length;
  const orphanedFields = recipientFields.filter(
    (field) => field.recipientId && !roleIds.has(String(field.recipientId))
  ).length;
  const rolesMissingFields = roles.filter(
    (role, index) => role.role !== 'viewer' && !assignedRoleIds.has(String(role.id || `role_${index + 1}`))
  ).length;
  const missingRoles = roles.length === 0;
  const missingFields = recipientFields.length === 0;
  const layoutNeedsReview = input.fieldLayoutStatus === 'needs_review';

  return {
    ready:
      !missingRoles &&
      !missingFields &&
      !layoutNeedsReview &&
      unassignedFields === 0 &&
      orphanedFields === 0 &&
      rolesMissingFields === 0,
    missingRoles,
    missingFields,
    layoutNeedsReview,
    unassignedFields,
    orphanedFields,
    rolesMissingFields,
  };
}
