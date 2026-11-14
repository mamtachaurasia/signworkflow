// @vitest-environment jsdom

import React from 'react';
import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import SignPageClient from '../app/sign/[token]/SignPageClient';
import type { EditorProps } from '../components/builder/DocumentEditor';

let latestEditorProps: EditorProps | null = null;
let autoOpenedFieldCount = 0;
const scrollIntoViewMock = vi.fn();

vi.mock('next/navigation', () => ({
  notFound: vi.fn(),
}));

vi.mock('@/components/builder/DocumentEditor', () => ({
  default: function MockDocumentEditor(props: EditorProps) {
    latestEditorProps = props;
    const [ready, setReady] = React.useState(false);

    React.useEffect(() => {
      const timer = window.setTimeout(() => setReady(true), 300);
      return () => window.clearTimeout(timer);
    }, []);

    if (!ready) {
      return <div data-testid="document-editor-delayed" />;
    }

    return (
      <div data-testid="document-editor-ready">
        {props.initialFields?.[0] ? (
          <button
            data-field-id={props.initialFields[0].id}
            onClick={() => {
              autoOpenedFieldCount += 1;
            }}
            type="button"
          >
            Sign here
          </button>
        ) : null}
      </div>
    );
  },
}));

describe('sign guidance autostart', () => {
  beforeEach(() => {
    latestEditorProps = null;
    autoOpenedFieldCount = 0;
    scrollIntoViewMock.mockReset();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);

        if (url.includes('/api/sign-document/consent')) {
          return {
            ok: true,
            json: async () => ({
              success: true,
              consent: {
                esignDisclosureAccepted: true,
                esignDisclosureAcceptedAt: '2026-04-23T09:00:00.000Z',
                esignDisclosureVersion: '2026-04-08',
                esignDisclosureMethod: 'checkbox',
                method: 'checkbox',
              },
            }),
          };
        }

        return {
          ok: true,
          json: async () => ({
            success: true,
            document: {
              id: 'doc-1',
              fileUrl: 'https://example.com/doc.pdf',
              name: 'Document',
              status: 'sent',
              currentRecipientId: 'recipient-1',
              recipients: [
                {
                  id: 'recipient-1',
                  email: 'recipient@example.com',
                  name: 'Recipient',
                  role: 'signer',
                  color: '#2563eb',
                  order: 1,
                  status: 'pending',
                  consent: {
                    esignDisclosureAccepted: true,
                    esignDisclosureAcceptedAt: '2026-04-23T09:00:00.000Z',
                    esignDisclosureVersion: '2026-04-08',
                    esignDisclosureMethod: 'checkbox',
                    method: 'checkbox',
                  },
                },
              ],
              fields: [
                {
                  id: 'field-1',
                  type: 'signature',
                  x: 10,
                  y: 20,
                  width: 120,
                  height: 40,
                  pageNumber: 1,
                  recipientId: 'recipient-1',
                  required: true,
                  value: '',
                  fieldOwner: 'recipients',
                },
              ],
            },
          }),
        };
      }),
    );

    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoViewMock,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('auto-targets the first required field without auto-opening it', async () => {
    render(<SignPageClient token="token-1" />);

    await waitFor(() => {
      expect(latestEditorProps?.guidedFieldId).toBe('field-1');
    }, { timeout: 4000 });

    await waitFor(() => {
      expect(scrollIntoViewMock).toHaveBeenCalled();
    }, { timeout: 4000 });

    expect(autoOpenedFieldCount).toBe(0);
    expect(screen.getByRole('button', { name: 'Sign here' })).toBeInTheDocument();
  }, 10000);

  it('lets a signer reopen the e-sign disclosure after choosing review later', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => ({
        ok: true,
        json: async () => ({
          success: true,
          document: {
            id: 'doc-1',
            fileUrl: 'https://example.com/doc.pdf',
            name: 'Document',
            status: 'sent',
            currentRecipientId: 'recipient-1',
            recipients: [
              {
                id: 'recipient-1',
                email: 'recipient@example.com',
                name: 'Recipient',
                role: 'signer',
                color: '#2563eb',
                order: 1,
                status: 'pending',
                consent: {
                  esignDisclosureAccepted: false,
                },
              },
            ],
            fields: [
              {
                id: 'field-1',
                type: 'signature',
                x: 10,
                y: 20,
                width: 120,
                height: 40,
                pageNumber: 1,
                recipientId: 'recipient-1',
                required: true,
                value: '',
                fieldOwner: 'recipients',
              },
            ],
          },
        }),
      })),
    );

    render(<SignPageClient token="token-1" />);

    const reviewLaterButton = await screen.findByRole('button', { name: 'Review later' });
    fireEvent.click(reviewLaterButton);

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Review later' })).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Review disclosure' }));

    expect(await screen.findByRole('button', { name: 'Review later' })).toBeInTheDocument();
  }, 10000);
});
