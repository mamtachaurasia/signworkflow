// @vitest-environment jsdom

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import UploadZone from '@/components/UploadZone';

const mocks = vi.hoisted(() => ({
  handleCloudFile: vi.fn(),
  handleDrop: vi.fn(),
  handleFileInput: vi.fn(),
  handleSampleContract: vi.fn(),
  createScratchDocument: vi.fn(),
  importGoogleDriveFile: vi.fn(),
  openDropbox: vi.fn(),
  openGoogleDrive: vi.fn(),
  push: vi.fn(),
  useCloudDocumentPicker: vi.fn(),
  useCreateScratchDocument: vi.fn(),
  useDropZone: vi.fn(),
}));

vi.mock('next/image', () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => {
    return React.createElement('img', { ...props, alt: props.alt || '' });
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mocks.push,
  }),
}));

vi.mock('@/hooks/useDropZone', () => ({
  default: () => mocks.useDropZone(),
}));

vi.mock('@/hooks/useCreateScratchDocument', () => ({
  default: () => mocks.useCreateScratchDocument(),
}));

vi.mock('@/hooks/useCloudDocumentPicker', () => ({
  formatCloudFileSize: (size: number | null) => (size === null ? 'Unknown size' : `${size} B`),
  useCloudDocumentPicker: (args: { onFileSelected: (file: File, sourceLabel: string) => void }) =>
    mocks.useCloudDocumentPicker(args),
}));

describe('UploadZone', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useDropZone.mockReturnValue({
      isLoading: false,
      uploadStatus: {
        title: 'Uploading PDF...',
        detail: 'Preparing your document for the builder.',
      },
      handleCloudFile: mocks.handleCloudFile,
      handleDrop: mocks.handleDrop,
      handleFileInput: mocks.handleFileInput,
      handleSampleContract: mocks.handleSampleContract,
    });
    mocks.useCreateScratchDocument.mockReturnValue({
      createScratchDocument: mocks.createScratchDocument,
      isCreating: false,
    });
    mocks.useCloudDocumentPicker.mockReturnValue({
      closeGoogleDriveDialog: vi.fn(),
      googleDriveDialogOpen: false,
      googleDriveFiles: [],
      googleDriveLoading: false,
      importGoogleDriveFile: mocks.importGoogleDriveFile,
      importingCloudFileId: null,
      isPickingCloud: false,
      openDropbox: mocks.openDropbox,
      openGoogleDrive: mocks.openGoogleDrive,
    });
  });

  it('shows the requested document source choices', () => {
    render(<UploadZone />);

    expect(screen.getByRole('heading', { name: 'Start a document' })).toBeInTheDocument();
    expect(screen.getByText('Choose from computer')).toBeInTheDocument();
    expect(screen.getByText('Choose from cloud')).toBeInTheDocument();
    expect(screen.getByText('Choose from Templates')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Browse File' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose from Dropbox' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Choose from Google Drive' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Browse Templates' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start writing' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Need a quick test?' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'What happens next' })).toBeInTheDocument();
  });

  it('opens cloud provider choices and starts Google Drive or Dropbox import', () => {
    render(<UploadZone />);

    fireEvent.click(screen.getByRole('button', { name: 'Choose from Google Drive' }));

    expect(mocks.openGoogleDrive).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Choose from Dropbox' }));

    expect(mocks.openDropbox).toHaveBeenCalledTimes(1);
  });

  it('routes template choice to templates', () => {
    render(<UploadZone />);

    fireEvent.click(screen.getByRole('button', { name: 'Browse Templates' }));

    expect(mocks.push).toHaveBeenCalledWith('/templates');
  });

  it('starts a writable draft from the prominent writing action', () => {
    render(<UploadZone />);

    fireEvent.click(screen.getByRole('button', { name: 'Start writing' }));

    expect(mocks.createScratchDocument).toHaveBeenCalledTimes(1);
  });

  it('keeps the sample contract action available', () => {
    render(<UploadZone />);

    fireEvent.click(screen.getByRole('button', { name: /Create a sample contract/i }));

    expect(mocks.handleSampleContract).toHaveBeenCalledTimes(1);
  });

  it('renders Google Drive files and imports the selected file', () => {
    const file = {
      id: 'drive-file-1',
      name: 'NDA.pdf',
      mimeType: 'application/pdf',
      size: 2048,
      modifiedTime: '2026-07-20T10:00:00.000Z',
    };
    mocks.useCloudDocumentPicker.mockReturnValue({
      closeGoogleDriveDialog: vi.fn(),
      googleDriveDialogOpen: true,
      googleDriveFiles: [file],
      googleDriveLoading: false,
      importGoogleDriveFile: mocks.importGoogleDriveFile,
      importingCloudFileId: null,
      isPickingCloud: false,
      openDropbox: mocks.openDropbox,
      openGoogleDrive: mocks.openGoogleDrive,
    });

    render(<UploadZone />);

    fireEvent.click(screen.getByRole('button', { name: 'Choose NDA.pdf from Google Drive' }));

    expect(mocks.importGoogleDriveFile).toHaveBeenCalledWith(file);
  });
});
