export function buildUnassignedOrgConditions(fieldName = 'orgId'): Array<Record<string, unknown>> {
  return [
    { [fieldName]: { $exists: false } },
    { [fieldName]: null },
  ];
}

export function buildWorkspaceOwnedFilter(args: {
  userId: string;
  orgId?: string | null;
  fieldName?: string;
  extra?: Record<string, unknown>;
}): Record<string, unknown> {
  const { userId, orgId, fieldName = 'orgId', extra = {} } = args;

  if (orgId) {
    return {
      userId,
      [fieldName]: orgId,
      ...extra,
    };
  }

  return {
    userId,
    ...extra,
    $or: buildUnassignedOrgConditions(fieldName),
  };
}

export function buildWorkspaceScopeFilter(
  orgId?: string | null,
  fieldName = 'orgId'
): Record<string, unknown> {
  if (orgId) {
    return { [fieldName]: orgId };
  }

  return {
    $or: buildUnassignedOrgConditions(fieldName),
  };
}
