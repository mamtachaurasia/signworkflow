import { randomUUID } from 'crypto';

import { normalizeFieldOwner } from '@/lib/field-normalization';

const TEMPLATE_ROLES = new Set(['signer', 'approver', 'viewer']);

export function sanitizeTemplateFields(fields: unknown) {
  if (!Array.isArray(fields)) return [];

  return fields
    .filter((field): field is Record<string, unknown> => Boolean(field) && typeof field === 'object')
    .map((field) => {
      const pageRectSource =
        field.pageRect && typeof field.pageRect === 'object'
          ? (field.pageRect as Record<string, unknown>)
          : null;
      const pageRect =
        pageRectSource
          ? {
              x: typeof pageRectSource.x === 'number' ? pageRectSource.x : undefined,
              y: typeof pageRectSource.y === 'number' ? pageRectSource.y : undefined,
              width: typeof pageRectSource.width === 'number' ? pageRectSource.width : undefined,
              height: typeof pageRectSource.height === 'number' ? pageRectSource.height : undefined,
              top: typeof pageRectSource.top === 'number' ? pageRectSource.top : undefined,
              right: typeof pageRectSource.right === 'number' ? pageRectSource.right : undefined,
              bottom: typeof pageRectSource.bottom === 'number' ? pageRectSource.bottom : undefined,
              left: typeof pageRectSource.left === 'number' ? pageRectSource.left : undefined,
            }
          : undefined;

      const cleanedPageRect =
        pageRect && Object.values(pageRect).some((value) => typeof value === 'number')
          ? pageRect
          : undefined;

      return {
        ...field,
        id: String(field.id ?? ''),
        pageRect: cleanedPageRect,
        fieldOwner: normalizeFieldOwner(field),
      };
    })
    .filter((field) => field.id.length > 0);
}

export function sanitizeTemplateDefaultSigners(defaultSigners: unknown) {
  if (!Array.isArray(defaultSigners)) return [];

  return defaultSigners
    .filter((signer): signer is Record<string, unknown> => Boolean(signer) && typeof signer === 'object')
    .map((signer, index) => {
      const role =
        typeof signer.role === 'string' && TEMPLATE_ROLES.has(signer.role)
          ? signer.role
          : 'signer';
      const id =
        typeof signer.id === 'string' && signer.id.trim().length > 0
          ? signer.id.trim()
          : `recipient_${randomUUID()}`;

      return {
        id,
        name: typeof signer.name === 'string' ? signer.name.trim() : '',
        email: typeof signer.email === 'string' ? signer.email.trim() : '',
        role,
        order: typeof signer.order === 'number' ? signer.order : index + 1,
      };
    });
}

export function sanitizeTemplateTags(tags: unknown) {
  if (!Array.isArray(tags)) return [];

  return tags
    .filter((tag): tag is string => typeof tag === 'string')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}
