import { describe, expect, it } from 'vitest';

import { filterDocs } from '@/hooks/useFilteredDocs';
import type { Doc } from '@/types/types';

const documents: Doc[] = [
  {
    id: 'doc-1',
    documentId: 'doc-1',
    name: 'Master Services Agreement',
    createdAt: new Date('2026-03-01T00:00:00.000Z'),
    status: 'draft',
    teamId: 'team-1',
    teamName: 'Sales',
  },
  {
    id: 'doc-2',
    documentId: 'doc-2',
    name: 'Employment Offer',
    createdAt: new Date('2026-03-02T00:00:00.000Z'),
    status: 'sent',
    teamId: 'team-2',
    teamName: 'Legal',
  },
  {
    id: 'doc-3',
    documentId: 'doc-3',
    name: 'Standalone NDA',
    createdAt: new Date('2026-03-03T00:00:00.000Z'),
    status: 'draft',
    teamId: null,
    teamName: null,
  },
];

describe('filterDocs', () => {
  it('filters documents to the selected team', () => {
    const results = filterDocs(documents, {
      selectedStatus: null,
      searchQuery: '',
      selectedTeamId: 'team-1',
    });

    expect(results.map((doc) => doc.id)).toEqual(['doc-1']);
  });

  it('filters to unassigned documents', () => {
    const results = filterDocs(documents, {
      selectedStatus: null,
      searchQuery: '',
      selectedTeamId: 'unassigned',
    });

    expect(results.map((doc) => doc.id)).toEqual(['doc-3']);
  });

  it('applies search and status filters together with team filtering', () => {
    const results = filterDocs(documents, {
      selectedStatus: 'sent',
      searchQuery: 'offer',
      selectedTeamId: 'team-2',
    });

    expect(results.map((doc) => doc.id)).toEqual(['doc-2']);
  });
});
