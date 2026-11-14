import { describe, expect, it } from 'vitest';
import type { DocumentField, DroppedComponent, Recipient } from '../types/types';
import { PAGE_MARGIN } from '../utils/builder/constants';
import { buildImportedPageFields, buildReplacementPageFields } from '../utils/builder/importPageFields';
import { getRenderedPageSpan } from '../utils/builder/pageOperations';

const defaultPageSize = { width: 612, height: 792 };
const mediumPageSize = { width: 612, height: 400 };

const buildField = (overrides: Partial<DocumentField> = {}): DocumentField => ({
  id: 'field-1',
  type: 'text',
  x: 24,
  y: PAGE_MARGIN + 20,
  width: 120,
  height: 32,
  pageNumber: 1,
  required: true,
  value: 'signed value',
  fieldOwner: 'recipients',
  recipientId: 'source-recipient',
  pageRect: {
    left: 0,
    right: 890,
    width: 890,
    height: 1148,
    y: PAGE_MARGIN,
    top: PAGE_MARGIN,
    bottom: PAGE_MARGIN + 1148,
  },
  ...overrides,
});

const buildComponent = (overrides: Partial<DroppedComponent> = {}): DroppedComponent => ({
  id: 1,
  fieldId: '1',
  component: 'Text',
  x: 10,
  y: 20,
  width: 100,
  height: 40,
  pageNumber: 1,
  pageRect: null,
  fieldOwner: 'recipients',
  required: true,
  data: '',
  ...overrides,
});

describe('buildImportedPageFields', () => {
  it('imports only selected pages and remaps their field positions', () => {
    const currentPageSizes = [defaultPageSize];
    const sourcePageSizes = [defaultPageSize, mediumPageSize, defaultPageSize];
    const currentComponents = [
      buildComponent({ id: 1, fieldId: '1', pageNumber: 1 }),
      buildComponent({ id: 2, fieldId: '2', pageNumber: 2, y: 220 }),
    ];
    const recipients: Recipient[] = [
      {
        id: 'recipient-1',
        name: 'Alex',
        email: 'alex@example.com',
        role: 'signer',
        color: '#2563eb',
        order: 1,
        status: 'pending',
      },
    ];

    const sourcePage2Top = PAGE_MARGIN + getRenderedPageSpan(sourcePageSizes[0]);
    const sourcePage3Top = sourcePage2Top + getRenderedPageSpan(sourcePageSizes[1]);
    const destinationPage2Top = PAGE_MARGIN + getRenderedPageSpan(currentPageSizes[0]);
    const destinationPage3Top = destinationPage2Top + getRenderedPageSpan(sourcePageSizes[0]);

    const importedFields = buildImportedPageFields({
      currentComponents,
      currentPageSizes,
      sourceFields: [
        buildField({
          id: 'alpha',
          pageNumber: 1,
          y: PAGE_MARGIN + 24,
          pageRect: {
            left: 0,
            right: 890,
            width: 890,
            height: 1148,
            y: PAGE_MARGIN,
            top: PAGE_MARGIN,
            bottom: PAGE_MARGIN + 1148,
          },
        }),
        buildField({
          id: 'beta',
          pageNumber: 2,
          y: sourcePage2Top + 18,
        }),
        buildField({
          id: 'gamma',
          pageNumber: 3,
          y: sourcePage3Top + 36,
          pageRect: {
            left: 0,
            right: 890,
            width: 890,
            height: 1148,
            y: sourcePage3Top,
            top: sourcePage3Top,
            bottom: sourcePage3Top + 1148,
          },
        }),
      ],
      sourcePageSizes,
      selectedPageIndexes: [0, 2],
      insertAfterPageNumber: 1,
      recipients,
    });

    expect(importedFields).toHaveLength(2);
    expect(importedFields[0]).toMatchObject({
      pageNumber: 2,
      y: destinationPage2Top + 24,
      assignedRecipientId: null,
      data: null,
    });
    expect(importedFields[1]).toMatchObject({
      pageNumber: 3,
      y: destinationPage3Top + 36,
      assignedRecipientId: null,
      data: null,
    });
    expect(importedFields[0].id).toBeGreaterThan(2);
    expect(importedFields[1].id).toBeGreaterThan(importedFields[0].id);
    expect(importedFields[1].pageRect).toMatchObject({
      top: destinationPage3Top,
      y: destinationPage3Top,
      bottom: destinationPage3Top + 1148,
    });
  });

  it('maps selected source-page fields onto the replaced page', () => {
    const currentPageSizes = [defaultPageSize, mediumPageSize];
    const sourcePageSizes = [mediumPageSize, defaultPageSize];
    const currentComponents = [
      buildComponent({ id: 1, fieldId: '1', pageNumber: 1 }),
      buildComponent({ id: 2, fieldId: '2', pageNumber: 2, y: 220 }),
    ];
    const recipients: Recipient[] = [
      {
        id: 'recipient-1',
        name: 'Alex',
        email: 'alex@example.com',
        role: 'signer',
        color: '#2563eb',
        order: 1,
        status: 'pending',
      },
    ];
    const sourcePage2Top = PAGE_MARGIN + getRenderedPageSpan(sourcePageSizes[0]);
    const destinationPage2Top = PAGE_MARGIN + getRenderedPageSpan(currentPageSizes[0]);

    const importedFields = buildReplacementPageFields({
      currentComponents,
      currentPageSizes,
      sourceFields: [
        buildField({
          id: 'alpha',
          pageNumber: 1,
          y: PAGE_MARGIN + 24,
        }),
        buildField({
          id: 'beta',
          pageNumber: 2,
          y: sourcePage2Top + 36,
          recipientId: 'recipient-1',
          pageRect: {
            left: 0,
            right: 890,
            width: 890,
            height: 1148,
            y: sourcePage2Top,
            top: sourcePage2Top,
            bottom: sourcePage2Top + 1148,
          },
        }),
      ],
      sourcePageSizes,
      sourcePageIndex: 1,
      targetPageNumber: 2,
      recipients,
    });

    expect(importedFields).toHaveLength(1);
    expect(importedFields[0]).toMatchObject({
      pageNumber: 2,
      y: destinationPage2Top + 36,
      assignedRecipientId: 'recipient-1',
      data: null,
    });
    expect(importedFields[0].pageRect).toMatchObject({
      top: destinationPage2Top,
      y: destinationPage2Top,
      bottom: destinationPage2Top + 1148,
    });
  });
});
