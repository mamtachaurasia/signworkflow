import { describe, expect, it } from 'vitest';

import { getTemplateLayoutState } from '@/lib/template-layout';

describe('template layout state', () => {
  it('grandfathers templates without layout metadata as current', () => {
    expect(getTemplateLayoutState({})).toEqual({
      fieldLayoutStatus: 'current',
      layoutRevision: 1,
      fieldLayoutRevision: 1,
    });
  });

  it('keeps a stale field revision behind the current layout revision', () => {
    expect(getTemplateLayoutState({
      fieldLayoutStatus: 'needs_review',
      layoutRevision: 4,
      fieldLayoutRevision: 2,
    })).toEqual({
      fieldLayoutStatus: 'needs_review',
      layoutRevision: 4,
      fieldLayoutRevision: 2,
    });
  });
});
