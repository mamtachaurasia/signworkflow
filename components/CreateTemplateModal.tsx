'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, FilePlus2, FileText, Search, Upload, X } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';

import { Button, Modal } from '@ui';
import { useTemplates, type Template } from '@/hooks/useTemplates';
import { buildTemplateBuilderHref, createTemplateNavigationContext } from '@/lib/template-navigation';
import { validatePdfUploadMetadata } from '@/lib/pdf-upload-validation';
import type { Doc } from '@/types/types';

interface CreateTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

type TemplateSource = 'document' | 'upload' | null;

const DEFAULT_TEMPLATE_VALUES = {
  category: 'Other',
  description: '',
  sharingScope: 'private' as const,
  tags: [] as string[],
};

const MAX_TEMPLATE_UPLOAD_BYTES = 25 * 1024 * 1024;
const TEMPLATE_UPLOAD_ACCEPT =
  '.pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function templateNameFromFile(fileName: string) {
  return fileName.replace(/\.(?:pdf|docx?)$/i, '').trim() || 'Untitled template';
}

export default function CreateTemplateModal({
  isOpen,
  onClose,
  onSuccess,
}: CreateTemplateModalProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { createScratchTemplate, createTemplate, uploadTemplate } = useTemplates();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const submissionLockRef = useRef(false);

  const [source, setSource] = useState<TemplateSource>(null);
  const [documents, setDocuments] = useState<Doc[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<Doc | null>(null);
  const [documentSearch, setDocumentSearch] = useState('');
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [documentsError, setDocumentsError] = useState<string | null>(null);
  const [documentsRequest, setDocumentsRequest] = useState(0);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen || source !== 'document') return;

    const controller = new AbortController();

    async function fetchDocuments() {
      setDocumentsLoading(true);
      setDocumentsError(null);

      try {
        const response = await fetch('/api/documents/list', {
          credentials: 'include',
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('Unable to load your documents');

        const data = await response.json();
        const availableDocuments = Array.isArray(data.documents)
          ? data.documents.filter((document: Doc) => document.status !== 'trashed')
          : [];
        setDocuments(availableDocuments);
      } catch (error) {
        if (controller.signal.aborted) return;
        setDocuments([]);
        setDocumentsError(
          error instanceof Error ? error.message : 'Unable to load your documents'
        );
      } finally {
        if (!controller.signal.aborted) setDocumentsLoading(false);
      }
    }

    void fetchDocuments();
    return () => controller.abort();
  }, [documentsRequest, isOpen, source]);

  const filteredDocuments = useMemo(() => {
    const query = documentSearch.trim().toLocaleLowerCase();
    if (!query) return documents;

    return documents.filter((document) =>
      `${document.name} ${document.status}`.toLocaleLowerCase().includes(query)
    );
  }, [documentSearch, documents]);

  const resetFlow = () => {
    setSource(null);
    setSelectedDocument(null);
    setDocumentSearch('');
    setUploadedFile(null);
    setIsDragging(false);
    setDocumentsError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = () => {
    if (submissionLockRef.current) return;
    resetFlow();
    onClose();
  };

  const handleBack = () => {
    if (submissionLockRef.current) return;
    setSource(null);
    setSelectedDocument(null);
    setDocumentSearch('');
    setUploadedFile(null);
    setDocumentsError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const openTemplateBuilder = (template: Template) => {
    if (!template?._id) {
      throw new Error('The template was created without a usable ID. Please try again.');
    }

    resetFlow();
    onClose();
    onSuccess?.();
    const navigationContext = createTemplateNavigationContext(pathname, searchParams, 'my');
    router.push(buildTemplateBuilderHref(
      template._id,
      template.editableContent ? 'content' : 'fields',
      navigationContext
    ));
  };

  const createFromDocument = async () => {
    if (submissionLockRef.current) return;
    if (!selectedDocument) {
      toast.error('Select a document to continue');
      return;
    }

    submissionLockRef.current = true;
    setIsSubmitting(true);
    try {
      const template = await createTemplate({
        ...DEFAULT_TEMPLATE_VALUES,
        documentId: selectedDocument.id,
        name: selectedDocument.name.trim() || 'Untitled template',
      });
      toast.success('Template draft created');
      openTemplateBuilder(template);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to create the template');
    } finally {
      submissionLockRef.current = false;
      setIsSubmitting(false);
    }
  };

  const selectUpload = (file: File | undefined) => {
    if (!file) return;

    if (validatePdfUploadMetadata(file)) {
      setUploadedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      toast.error('Choose a PDF, DOC, or DOCX file');
      return;
    }

    if (file.size > MAX_TEMPLATE_UPLOAD_BYTES) {
      setUploadedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      toast.error('Choose a file that is 25 MB or smaller');
      return;
    }

    setUploadedFile(file);
  };

  const createFromUpload = async () => {
    if (submissionLockRef.current) return;
    if (!uploadedFile) {
      toast.error('Choose a PDF, DOC, or DOCX file to continue');
      return;
    }

    submissionLockRef.current = true;
    setIsSubmitting(true);
    try {
      const template = await uploadTemplate(uploadedFile, {
        ...DEFAULT_TEMPLATE_VALUES,
        name: templateNameFromFile(uploadedFile.name),
      });
      if (!template) throw new Error('Unable to upload the template');

      toast.success('Template draft created');
      openTemplateBuilder(template);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to upload the template');
    } finally {
      submissionLockRef.current = false;
      setIsSubmitting(false);
    }
  };

  const createFromScratch = async () => {
    if (submissionLockRef.current) return;

    submissionLockRef.current = true;
    setIsSubmitting(true);
    try {
      const template = await createScratchTemplate({ name: 'Untitled template' });
      toast.success('Blank template draft created');
      openTemplateBuilder(template);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to create a blank template');
    } finally {
      submissionLockRef.current = false;
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const modalDescription = source
    ? 'We will create a private draft and open it in the Template Builder.'
    : 'Choose a starting point. You can add roles, fields, and template details in the Builder.';

  return (
    <Modal
      visible={isOpen}
      onClose={handleClose}
      title="Create a template"
      description={modalDescription}
      className="w-[680px]"
      closeOnBackdrop={!isSubmitting}
      closeOnEsc={!isSubmitting}
      showCloseButton={!isSubmitting}
    >
      {source === null ? (
        <div className="space-y-5">
          <div>
            <h3 className="text-sm font-semibold text-slate-950">How would you like to start?</h3>
            <p className="mt-1 text-sm text-slate-600">Your template starts private. Details can be changed later.</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3" aria-label="Template source choices">
            <SourceCard
              title="From existing document"
              description="Reuse a document you already prepared."
              icon={<FileText className="h-5 w-5" />}
              disabled={isSubmitting}
              onClick={() => setSource('document')}
            />
            <SourceCard
              title="Upload a document"
              description="Add a PDF, DOC, or DOCX from your computer."
              icon={<Upload className="h-5 w-5" />}
              disabled={isSubmitting}
              onClick={() => setSource('upload')}
            />
            <SourceCard
              title="Start from scratch"
              description="Open a blank editable template."
              icon={<FilePlus2 className="h-5 w-5" />}
              disabled={isSubmitting}
              loading={isSubmitting}
              onClick={() => void createFromScratch()}
            />
          </div>

          <div className="flex justify-end border-t border-slate-200 pt-4">
            <Button type="button" size="sm" variant="outline" onClick={handleClose} disabled={isSubmitting}>
              Cancel
            </Button>
          </div>
        </div>
      ) : source === 'document' ? (
        <div className="space-y-4">
          <div>
            <label htmlFor="template-document-search" className="text-sm font-medium text-slate-800">
              Search your documents
            </label>
            <div className="relative mt-1.5">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="template-document-search"
                type="search"
                value={documentSearch}
                onChange={(event) => setDocumentSearch(event.target.value)}
                placeholder="Search by document name or status"
                className="h-10 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-950 outline-hidden transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                disabled={isSubmitting}
              />
            </div>
          </div>

          <div className="min-h-52 rounded-xl border border-slate-200 bg-slate-50/70 p-2">
            {documentsLoading ? (
              <div className="flex min-h-48 items-center justify-center text-sm text-slate-600" role="status">
                Loading your documents…
              </div>
            ) : documentsError ? (
              <div className="flex min-h-48 flex-col items-center justify-center gap-3 px-4 text-center" role="alert">
                <p className="text-sm text-slate-700">{documentsError}</p>
                <Button type="button" size="sm" variant="outline" onClick={() => setDocumentsRequest((value) => value + 1)}>
                  Try again
                </Button>
              </div>
            ) : documents.length === 0 ? (
              <div className="flex min-h-48 flex-col items-center justify-center px-4 text-center">
                <FileText className="mb-2 h-6 w-6 text-slate-400" />
                <p className="text-sm font-medium text-slate-800">No documents available</p>
                <p className="mt-1 text-xs text-slate-500">Go back to upload a document or start from scratch.</p>
              </div>
            ) : filteredDocuments.length === 0 ? (
              <div className="flex min-h-48 items-center justify-center px-4 text-center text-sm text-slate-600">
                No documents match “{documentSearch}”.
              </div>
            ) : (
              <div className="max-h-72 space-y-1 overflow-y-auto" role="radiogroup" aria-label="Available documents">
                {filteredDocuments.map((document) => {
                  const selected = selectedDocument?.id === document.id;
                  return (
                    <button
                      key={document.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      disabled={isSubmitting}
                      onClick={() => setSelectedDocument(document)}
                      className={`flex w-full items-center gap-3 rounded-lg border px-3 py-3 text-left transition ${
                        selected
                          ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-200'
                          : 'border-transparent bg-white hover:border-slate-300'
                      }`}
                    >
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${selected ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-500'}`}>
                        <FileText className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-slate-900">{document.name}</span>
                        <span className="block text-xs capitalize text-slate-500">{document.status.replaceAll('_', ' ')}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <FlowActions
            isSubmitting={isSubmitting}
            primaryDisabled={!selectedDocument}
            primaryLabel={isSubmitting ? 'Creating draft…' : 'Create and continue'}
            onBack={handleBack}
            onCancel={handleClose}
            onPrimary={() => void createFromDocument()}
          />
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label htmlFor="template-document-input" className="text-sm font-medium text-slate-800">
              Document file
            </label>
            <div
              className={`mt-1.5 rounded-xl border-2 border-dashed px-5 py-8 text-center transition ${
                isDragging ? 'border-brand-500 bg-brand-50' : 'border-slate-300 bg-slate-50/70'
              }`}
              onDragEnter={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={(event) => {
                event.preventDefault();
                setIsDragging(false);
              }}
              onDrop={(event) => {
                event.preventDefault();
                setIsDragging(false);
                selectUpload(event.dataTransfer.files[0]);
              }}
            >
              <input
                ref={fileInputRef}
                id="template-document-input"
                type="file"
                accept={TEMPLATE_UPLOAD_ACCEPT}
                className="sr-only"
                disabled={isSubmitting}
                onChange={(event) => selectUpload(event.target.files?.[0])}
              />
              <Upload className="mx-auto h-7 w-7 text-slate-400" />
              <p className="mt-2 text-sm font-medium text-slate-900">Drop your document here</p>
              <p className="mt-1 text-xs text-slate-500">PDF, DOC, or DOCX · up to 25 MB</p>
              <p className="mt-1 text-xs text-slate-500">or choose it from your computer</p>
              <label
                htmlFor="template-document-input"
                className="mt-4 inline-flex h-9 cursor-pointer items-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 shadow-xs transition hover:bg-slate-50"
              >
                Choose document
              </label>
            </div>
          </div>

          {uploadedFile ? (
            <div className="flex items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 px-3 py-3" role="status">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-brand-700">
                <FileText className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-900">{uploadedFile.name}</span>
                <span className="block text-xs text-slate-600">{(uploadedFile.size / 1024 / 1024).toFixed(2)} MB</span>
              </span>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label="Remove selected document"
                disabled={isSubmitting}
                onClick={() => {
                  setUploadedFile(null);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : null}

          <FlowActions
            isSubmitting={isSubmitting}
            primaryDisabled={!uploadedFile}
            primaryLabel={isSubmitting ? 'Uploading…' : 'Upload and continue'}
            onBack={handleBack}
            onCancel={handleClose}
            onPrimary={() => void createFromUpload()}
          />
        </div>
      )}
    </Modal>
  );
}

function SourceCard({
  title,
  description,
  icon,
  disabled,
  loading = false,
  onClick,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  disabled: boolean;
  loading?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-busy={loading || undefined}
      onClick={onClick}
      className="group min-h-40 rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-brand-400 hover:bg-brand-50/40 hover:shadow-sm focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-600 transition group-hover:bg-brand-100 group-hover:text-brand-700">
        {icon}
      </span>
      <span className="mt-4 block text-sm font-semibold text-slate-950">{loading ? 'Creating blank draft…' : title}</span>
      <span className="mt-1 block text-xs leading-5 text-slate-600">{description}</span>
    </button>
  );
}

function FlowActions({
  isSubmitting,
  primaryDisabled,
  primaryLabel,
  onBack,
  onCancel,
  onPrimary,
}: {
  isSubmitting: boolean;
  primaryDisabled: boolean;
  primaryLabel: string;
  onBack: () => void;
  onCancel: () => void;
  onPrimary: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        leadingIcon={<ArrowLeft className="h-4 w-4" />}
        disabled={isSubmitting}
        onClick={onBack}
      >
        Back
      </Button>
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" variant="outline" disabled={isSubmitting} onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          loading={isSubmitting}
          disabled={primaryDisabled || isSubmitting}
          onClick={onPrimary}
        >
          {primaryLabel}
        </Button>
      </div>
    </div>
  );
}
