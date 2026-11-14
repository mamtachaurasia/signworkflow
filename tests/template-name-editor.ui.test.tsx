// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('react-hot-toast', () => ({
  default: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
  },
}));

import TemplateNameEditor from '@/components/templates/builder/TemplateNameEditor';

describe('TemplateNameEditor', () => {
  beforeEach(() => vi.clearAllMocks());

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('prepopulates and saves a new name for an editable template', async () => {
    const onRenamed = vi.fn();
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ template: { name: 'Client onboarding agreement' } }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    render(
      <TemplateNameEditor
        templateId="507f1f77bcf86cd799439011"
        name="Untitled template"
        editable
        onRenamed={onRenamed}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Rename template Untitled template' }));
    const input = screen.getByRole('textbox', { name: 'Template name' });
    expect(input).toHaveValue('Untitled template');
    fireEvent.change(input, { target: { value: '  Client onboarding agreement  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save template name' }));

    await waitFor(() => expect(onRenamed).toHaveBeenCalledWith('Client onboarding agreement'));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/templates/507f1f77bcf86cd799439011',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ name: 'Client onboarding agreement' }),
      })
    );
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Template renamed');
  });

  it('does not expose rename for a read-only system template', () => {
    render(
      <TemplateNameEditor
        templateId="507f1f77bcf86cd799439011"
        name="System NDA"
        editable={false}
        onRenamed={vi.fn()}
      />
    );

    expect(screen.getByRole('heading', { name: 'System NDA' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Rename template/i })).not.toBeInTheDocument();
  });
});
