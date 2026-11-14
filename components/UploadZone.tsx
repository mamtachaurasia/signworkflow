'use client';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import useDropZone from '@/hooks/useDropZone';
import useCreateScratchDocument from '@/hooks/useCreateScratchDocument';
import {
  formatCloudFileSize,
  type GoogleDriveDocument,
  useCloudDocumentPicker,
} from '@/hooks/useCloudDocumentPicker';
import {
  CheckCircle2,
  Cloud,
  FileText,
  LoaderCircle,
  PenLine,
  X,
} from 'lucide-react';
import UploadProgressOverlay from '@/components/UploadProgressOverlay';
import { Button } from '@ui';
import { OrDivider, GoogleDriveLogo, DropboxLogo } from './CustomIconSet';

const FILE_INPUT_ID = 'document-upload-input';

function formatModifiedTime(value: string | null): string {
  if (!value) return 'Recently modified';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently modified';

  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}


function GoogleDriveDialog({
  files,
  importingCloudFileId,
  loading,
  onClose,
  onSelectFile,
}: {
  files: GoogleDriveDocument[];
  importingCloudFileId: string | null;
  loading: boolean;
  onClose: () => void;
  onSelectFile: (file: GoogleDriveDocument) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4">
      <div className="w-full max-w-2xl rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <Cloud className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold text-slate-900">Google Drive</h2>
              <p className="text-xs text-slate-500">PDF, DOC, DOCX</p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close Google Drive picker"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            onClick={onClose}
            disabled={Boolean(importingCloudFileId)}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="max-h-105 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center gap-3 py-12 text-sm text-slate-600">
              <LoaderCircle className="h-5 w-5 animate-spin text-brand-600" />
              Loading Google Drive files...
            </div>
          ) : files.length > 0 ? (
            <div className="grid gap-2">
              {files.map((file) => {
                const isImporting = importingCloudFileId === file.id;
                return (
                  <button
                    key={file.id}
                    type="button"
                    className="flex min-h-16 w-full items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-brand-300 hover:bg-brand-50/30 disabled:cursor-wait disabled:opacity-70"
                    onClick={() => onSelectFile(file)}
                    disabled={Boolean(importingCloudFileId)}
                    aria-label={`Choose ${file.name} from Google Drive`}
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                      {isImporting ? (
                        <LoaderCircle className="h-5 w-5 animate-spin" />
                      ) : (
                        <FileText className="h-5 w-5" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-slate-900">{file.name}</div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                        <span>{formatCloudFileSize(file.size)}</span>
                        <span>{formatModifiedTime(file.modifiedTime)}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="py-12 text-center">
              <FileText className="mx-auto h-10 w-10 text-slate-300" />
              <p className="mt-3 text-sm font-medium text-slate-700">No PDF, DOC, or DOCX files found</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function UploadZone() {
  const router = useRouter();
  const {
    isLoading,
    uploadStatus,
    handleDrop,
    handleSampleContract,
    handleFileInput,
    handleCloudFile,
  } = useDropZone();
  const { createScratchDocument, isCreating } = useCreateScratchDocument();
  const {
    closeGoogleDriveDialog,
    googleDriveDialogOpen,
    googleDriveFiles,
    googleDriveLoading,
    importGoogleDriveFile,
    importingCloudFileId,
    isPickingCloud,
    openDropbox,
    openGoogleDrive,
  } = useCloudDocumentPicker({ onFileSelected: handleCloudFile });

  if (isLoading) {
    return <UploadProgressOverlay status={uploadStatus} />;
  }

  return (
    <>
      <section
        className="mx-auto max-w-7xl p-4 sm:p-6"
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
      >

        <div className="rounded-lg bg-white px-4 py-6 sm:px-6 lg:px-8">
          <input
            id={FILE_INPUT_ID}
            type="file"
            className="sr-only"
            onChange={handleFileInput}
            accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          />
          <div className="flex items-start justify-between">
            <div>
               {/* <p className="text-xs font-semibold uppercase  text-brand-600">Start here</p> */}
              <h2 className="text-lg font-semibold text-slate-900">Start a document</h2>
              <p className="text-xs text-slate-600">
                Write a document from scratch, upload an existing file, or start from a template.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_40px_minmax(0,1fr)_40px_minmax(0,1fr)] pt-4 pb-8 my-4 relative rounded-xl border border-transparent bg-[linear-gradient(var(--color-white),var(--color-white)),linear-gradient(90deg,var(--color-pink-300),var(--color-purple-300),var(--color-blue-300),var(--color-teal-200),var(--color-pink-300))] bg-origin-border [background-clip:padding-box,border-box] bg-size-[100%_100%,400%_400%] animate-gradient-flow hover:shadow-[0_0_20px_-8px_var(--color-purple-500)] transition-shadow duration-500">
            <label htmlFor={FILE_INPUT_ID} className="flex flex-col items-center justify-center px-2 text-center">
              <h2 className="font-semibold text-slate-500 mb-7">Choose from computer</h2>
              <Button className="h-14 min-w-52 pointer-events-none"> Browse File </Button>
            </label>

            <OrDivider />
            <div className="flex flex-col items-center justify-center px-2 text-center">
              <h2 className="font-semibold text-slate-500 mb-7">Choose from cloud</h2>

              {isPickingCloud ? (
                <LoaderCircle className="absolute animate-spin text-blue-600" />
              ) : null}
              <div className="flex items-center justify-center gap-8">
                <Button
                  type="button"
                  className="inline-flex h-16 w-16"
                  onClick={() => void openDropbox()}
                  disabled={isPickingCloud}
                  aria-label="Choose from Dropbox"
                  title="Dropbox"
                  icon={<DropboxLogo className="p-2" />}
                  variant="outlineBrand"
                />
                <Button
                  type="button"
                  className="inline-flex h-16 w-16"
                  onClick={() => void openGoogleDrive()}
                  disabled={isPickingCloud}
                  aria-label="Choose from Google Drive"
                  title="Google Drive"
                  variant="outlineBrand"
                  icon={<GoogleDriveLogo className="p-2" />}
                />


              </div>
            </div>

            <OrDivider />


            <div className="flex flex-col items-center justify-center px-2 text-center">
              <h2 className="font-semibold text-slate-500">Choose from Templates</h2>
              <Button
                variant="outlineBrand"
                size="lg"
                className="mt-7 h-14 min-w-52"
                onClick={() => router.push('/templates')}
              >
                Browse Templates
              </Button>
            </div>
            <p className="absolute inset-x-6 -bottom-6 text-center text-sm text-slate-500 bg-white border p-4 rounded-full border-y-0">or drop a PDF, DOC, or DOCX here</p>
          </div>
          

           <div className="gap-3 grid justify-center mt-8 text-center">
              <div className="min-w-0 flex-1">
                <p className="text-gl font-semibold text-slate-900">Starting from a blank page?</p>
                <p className="text-xs text-slate-600">Write first, then add recipients and fields when the document is ready.</p>
              </div>
              <Button size="sm" type="button" disabled={isCreating} onClick={() => void createScratchDocument()}>
                <PenLine className="h-4 w-4" /> {isCreating ? 'Creating…' : 'Start writing'}
              </Button>
            </div>

        </div>
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 shadow-sm relative">
            <div className="flex items-start gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                <PenLine className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Need a quick test?</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Create a sample contract and try the signing flow before using a real document.
                </p>
                <button
                  type="button"
                  className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-brand-600 hover:text-brand-700"
                  onClick={handleSampleContract}
                >
                  Create a sample contract
                  <span aria-hidden="true">→</span>
                </button>
              </div>
            </div>
            <div className="absolute bottom-0 flex justify-end mt-5 pointer-events-none right-0">
              <Image
                src="/images/signIcon.png"
                alt="Create and sign a sample document"
                width={123}
                height={123}
                className="w-28"
                quality={100}
                loading="eager"
              />
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-700">
                <FileText className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900">What happens next</h3>
            </div>
            <ul className="mt-5 space-y-3">
              {[
                'Add signature, date, initials, and text fields.',
                'Invite one or more recipients to sign.',
                'Track status and keep the completed record in your dashboard.',
              ].map((item) => (
                <li key={item} className="flex gap-3 text-sm pl-3 text-slate-600">
                  <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-brand-600" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

      </section>
      {googleDriveDialogOpen ? (
        <GoogleDriveDialog
          files={googleDriveFiles}
          importingCloudFileId={importingCloudFileId}
          loading={googleDriveLoading}
          onClose={closeGoogleDriveDialog}
          onSelectFile={importGoogleDriveFile}
        />
      ) : null}
    </>
  );
}
