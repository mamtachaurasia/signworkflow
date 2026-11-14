// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prefetch: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    prefetch: mocks.prefetch,
    push: mocks.push,
    replace: mocks.replace,
  }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/hooks/useContextStore', () => ({
  default: () => ({ selectedFile: null, user: null }),
}));

vi.mock('@/components/MoreActionMenu', () => ({
  default: () => <button type="button">More actions</button>,
}));

vi.mock('@/components/builder/UnsavedChangesDialog', () => ({
  UnsavedChangesDialog: () => null,
}));

vi.mock('@/lib/pdf', () => ({
  downloadPdf: vi.fn(),
  loadPdf: vi.fn(),
  savePdfBlob: vi.fn(),
}));

vi.mock('@ui', () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  Button: ({ children, icon, label, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    icon?: React.ReactNode;
    inverted?: boolean;
    label?: React.ReactNode;
    size?: string;
  }) => {
    const { inverted, size, ...buttonProps } = props as typeof props & {
      inverted?: boolean;
      size?: string;
    };
    void inverted;
    void size;
    return <button {...buttonProps}>{icon}{label ?? children}</button>;
  },
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  Modal: ({ visible, children }: { visible?: boolean; children?: React.ReactNode }) => visible ? <div>{children}</div> : null,
  SaveButton: ({ label, saving, saved, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    label?: React.ReactNode;
    saving?: boolean;
    saved?: boolean;
  }) => {
    void saving;
    void saved;
    return <button {...props}>{label}</button>;
  },
}));

import ActionToolBar from '@/components/builder/ActionToolBar';

function renderToolbar(isTemplateEditor: boolean, onSaveAsTemplate?: () => void) {
  return render(
    <ActionToolBar
      documentName="Reusable NDA"
      setDocumentName={vi.fn()}
      isEditingFileName={false}
      setIsEditingFileName={vi.fn()}
      handleSavePDF={vi.fn(async () => true)}
      canUndo={false}
      canRedo={false}
      onUndo={vi.fn()}
      onRedo={vi.fn()}
      recipients={[]}
      onSendDocument={vi.fn()}
      hasUnsavedChanges={false}
      droppedItems={[]}
      isLoggedIn
      checkFieldError={vi.fn()}
      onPreviewDocument={vi.fn()}
      isTemplateEditor={isTemplateEditor}
      templateNavigation={isTemplateEditor ? <nav aria-label="Template setup">Content Roles &amp; fields Readiness Settings</nav> : undefined}
      onSaveAsTemplate={onSaveAsTemplate}
    />
  );
}

describe('ActionToolBar template mode', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('uses Builder naming and does not duplicate the library overview action', () => {
    renderToolbar(true);

    expect(screen.getByText('Template Builder')).toBeInTheDocument();
    const navigation = screen.getByRole('navigation', { name: 'Template setup' });
    const badge = screen.getByText('Template Builder');
    expect(navigation.parentElement).toBe(badge.parentElement);
    expect(Array.from(navigation.parentElement?.children || []).indexOf(navigation)).toBeLessThan(
      Array.from(badge.parentElement?.children || []).indexOf(badge)
    );
    expect(screen.queryByText('Reusable NDA')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Preview Document' })).not.toBeInTheDocument();
    expect(screen.queryByText('Template Editor')).not.toBeInTheDocument();
  });

  it('keeps recipient preview available for agreement documents', () => {
    renderToolbar(false);

    expect(screen.getByRole('button', { name: 'Preview Document' })).toBeInTheDocument();
    expect(screen.queryByText('Template Builder')).not.toBeInTheDocument();
  });

  it('uses the established Save as Template action label', () => {
    const onSaveAsTemplate = vi.fn();
    renderToolbar(false, onSaveAsTemplate);

    fireEvent.click(screen.getByRole('button', { name: 'More save options' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Save as Template' }));

    expect(onSaveAsTemplate).toHaveBeenCalledTimes(1);
  });
});
