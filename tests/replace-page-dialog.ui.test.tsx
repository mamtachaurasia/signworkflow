// @vitest-environment jsdom

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ReplacePageDialog from '../components/builder/ReplacePageDialog';
import { loadPdf } from '@/lib/pdf';

vi.mock('react-pdf', () => ({
  Document: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Page: () => <div>Page Preview</div>,
  pdfjs: {
    version: 'test',
    GlobalWorkerOptions: {
      workerSrc: '',
    },
  },
}));

vi.mock('@/lib/pdf', () => ({
  loadPdf: vi.fn(),
}));

describe('ReplacePageDialog', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('lets the user switch between my templates and system templates', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        templates: [
          {
            _id: 'template-my',
            name: 'Account Opening',
            category: 'Finance',
            isSystemTemplate: false,
            isActive: true,
          },
          {
            _id: 'template-system',
            name: 'Employment Offer',
            category: 'HR',
            isSystemTemplate: true,
            isActive: true,
          },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchSpy);

    render(
      <ReplacePageDialog
        visible
        mode="template"
        targetPageNumber={2}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Account Opening')).toBeInTheDocument();
    });

    expect(screen.queryByText('Employment Offer')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'System Templates' }));

    await waitFor(() => {
      expect(screen.getByText('Employment Offer')).toBeInTheDocument();
    });

    expect(screen.queryByText('Account Opening')).not.toBeInTheDocument();
  });

  it('lets append mode choose specific pages and import fields from a template', async () => {
    vi.mocked(loadPdf).mockResolvedValue({
      getPageCount: () => 2,
    } as never);

    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes('/api/templates/list')) {
        return {
          ok: true,
          json: async () => ({
            templates: [
              {
                _id: 'template-my',
                name: 'Account Opening',
                category: 'Finance',
                isSystemTemplate: false,
                isActive: true,
              },
            ],
          }),
        };
      }

      if (url.includes('/api/templates/load?id=template-my')) {
        return {
          ok: true,
          json: async () => ({
            template: {
              fields: [
                {
                  id: 'field-1',
                  type: 'text',
                  x: 10,
                  y: 20,
                  width: 100,
                  height: 30,
                  pageNumber: 1,
                  required: true,
                },
                {
                  id: 'field-2',
                  type: 'text',
                  x: 10,
                  y: 40,
                  width: 100,
                  height: 30,
                  pageNumber: 2,
                  required: true,
                },
              ],
            },
          }),
        };
      }

      throw new Error(`Unhandled fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchSpy);

    const onConfirm = vi.fn().mockResolvedValue(undefined);

    render(
      <ReplacePageDialog
        visible
        mode="template"
        targetPageNumber={2}
        actionMode="append"
        onClose={vi.fn()}
        onConfirm={onConfirm}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Account Opening')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Account Opening/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Toggle page 1' })).toBeInTheDocument();
    });

    expect(screen.getByText('2 of 2 pages selected')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Toggle page 2' }));

    await waitFor(() => {
      expect(screen.getByText('1 of 2 pages selected')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('checkbox', { name: /Import existing fields/i }));
    fireEvent.click(screen.getByText('Append 1 Page'));

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({
        selectedPageIndexes: [0],
        importSourceFields: true,
      }));
    });
  });

  it('lets append mode import existing fields from an existing document too', async () => {
    vi.mocked(loadPdf).mockResolvedValue({
      getPageCount: () => 2,
    } as never);

    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes('/api/documents/list')) {
        return {
          ok: true,
          json: async () => ({
            documents: [
              {
                id: 'document-1',
                name: 'Vendor Packet',
                status: 'saved',
                updatedAt: '2026-03-06T10:00:00.000Z',
              },
            ],
          }),
        };
      }

      if (url.includes('/api/documents/load?id=document-1')) {
        return {
          ok: true,
          json: async () => ({
            document: {
              fields: [
                {
                  id: 'field-1',
                  type: 'text',
                  x: 10,
                  y: 20,
                  width: 100,
                  height: 30,
                  pageNumber: 1,
                  required: true,
                },
              ],
            },
          }),
        };
      }

      throw new Error(`Unhandled fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchSpy);

    render(
      <ReplacePageDialog
        visible
        mode="existing"
        targetPageNumber={3}
        actionMode="append"
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Vendor Packet')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Vendor Packet/i }));

    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /Import existing fields/i })).toBeInTheDocument();
    });

    expect(screen.getByText('2 of 2 pages selected')).toBeInTheDocument();
  });

  it('lets replace mode import existing fields from an existing document', async () => {
    vi.mocked(loadPdf).mockResolvedValue({
      getPageCount: () => 2,
    } as never);

    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes('/api/documents/list')) {
        return {
          ok: true,
          json: async () => ({
            documents: [
              {
                id: 'document-2',
                name: 'Client Intake',
                status: 'saved',
                updatedAt: '2026-03-06T10:00:00.000Z',
              },
            ],
          }),
        };
      }

      if (url.includes('/api/documents/load?id=document-2')) {
        return {
          ok: true,
          json: async () => ({
            document: {
              fields: [
                {
                  id: 'field-7',
                  type: 'text',
                  x: 10,
                  y: 20,
                  width: 100,
                  height: 30,
                  pageNumber: 2,
                  required: true,
                },
              ],
            },
          }),
        };
      }

      throw new Error(`Unhandled fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchSpy);

    const onConfirm = vi.fn().mockResolvedValue(undefined);

    render(
      <ReplacePageDialog
        visible
        mode="existing"
        targetPageNumber={4}
        onClose={vi.fn()}
        onConfirm={onConfirm}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Client Intake')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Client Intake/i }));

    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /Import existing fields/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Select source page 2' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Import existing fields/i }));
    fireEvent.click(screen.getByText('Replace Page'));

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({
        sourcePageIndex: 1,
        importSourceFields: true,
      }));
    });
  });

  it('shows replace-specific guidance when source fields cannot be loaded', async () => {
    vi.mocked(loadPdf).mockResolvedValue({
      getPageCount: () => 1,
    } as never);

    const fetchSpy = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes('/api/documents/list')) {
        return {
          ok: true,
          json: async () => ({
            documents: [
              {
                id: 'document-3',
                name: 'Purchase Order',
                status: 'saved',
                updatedAt: '2026-03-06T10:00:00.000Z',
              },
            ],
          }),
        };
      }

      if (url.includes('/api/documents/load?id=document-3')) {
        return {
          ok: false,
          status: 500,
        };
      }

      throw new Error(`Unhandled fetch ${url}`);
    });
    vi.stubGlobal('fetch', fetchSpy);

    render(
      <ReplacePageDialog
        visible
        mode="existing"
        targetPageNumber={2}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Purchase Order')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Purchase Order/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/You can still replace the page without importing fields\./i)
      ).toBeInTheDocument();
    });
  });
});
