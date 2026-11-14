'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { FileText, RefreshCw, Search, Upload, LayoutTemplate } from 'lucide-react';
import { PDFDocument } from 'pdf-lib';
import { Modal } from '@ui';
import { Button } from '@ui';
import { Input } from '@ui';
import { loadPdf } from '@/lib/pdf';
import { dedupeFieldsById } from '@/utils/builder/documentFields';
import { initializePdfWorker } from '@/utils/pdfjsSetup';
import type { DocumentField } from '@/types/types';

initializePdfWorker(pdfjs);

type ReplacePageSourceMode = 'upload' | 'existing' | 'template';
type PdfSourceActionMode = 'replace' | 'append';

interface SourceOption {
  id: string;
  name: string;
  fileUrl: string;
  metadataUrl?: string;
  badge: string;
  subtitle: string;
  templateKind?: 'my' | 'system';
}

interface ExistingDocumentResponseItem {
  id?: unknown;
  name?: unknown;
  originalFileName?: unknown;
  status?: unknown;
  updatedAt?: unknown;
  createdAt?: unknown;
  deletedAt?: unknown;
  isTemplate?: unknown;
}

interface TemplateResponseItem {
  _id?: unknown;
  name?: unknown;
  category?: unknown;
  isSystemTemplate?: unknown;
  createdAt?: unknown;
  deletedAt?: unknown;
  isActive?: unknown;
}

interface ReplacePageDialogProps {
  visible: boolean;
  mode: ReplacePageSourceMode | null;
  targetPageNumber: number;
  actionMode?: PdfSourceActionMode;
  currentDocumentId?: string | null;
  initialSourceFile?: File | null;
  onClose: () => void;
  onConfirm: (payload: {
    sourcePdfDoc: PDFDocument;
    sourcePageIndex?: number;
    selectedPageIndexes?: number[];
    sourceFields?: DocumentField[];
    importSourceFields?: boolean;
  }) => Promise<void> | void;
}

const ReplacePageDialog: React.FC<ReplacePageDialogProps> = ({
  visible,
  mode,
  targetPageNumber,
  actionMode = 'replace',
  currentDocumentId = null,
  initialSourceFile = null,
  onClose,
  onConfirm,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sourceOptions, setSourceOptions] = useState<SourceOption[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoadingSourceOptions, setIsLoadingSourceOptions] = useState(false);
  const [sourceOptionsError, setSourceOptionsError] = useState<string | null>(null);
  const [isLoadingSource, setIsLoadingSource] = useState(false);
  const [sourceError, setSourceError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [previewSource, setPreviewSource] = useState<File | string | null>(null);
  const [sourcePdfDoc, setSourcePdfDoc] = useState<PDFDocument | null>(null);
  const [sourceFields, setSourceFields] = useState<DocumentField[]>([]);
  const [sourceFieldsError, setSourceFieldsError] = useState<string | null>(null);
  const [sourceName, setSourceName] = useState('');
  const [selectedSourcePage, setSelectedSourcePage] = useState(1);
  const [selectedSourcePageIndexes, setSelectedSourcePageIndexes] = useState<number[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [importSourceFields, setImportSourceFields] = useState(false);
  const [templateKind, setTemplateKind] = useState<'my' | 'system'>('my');
  const isAppendMode = actionMode === 'append';
  const supportsAppendFieldImport = isAppendMode && (mode === 'existing' || mode === 'template');
  const supportsReplaceFieldImport = !isAppendMode && mode === 'existing';
  const supportsSourceFieldImport = supportsAppendFieldImport || supportsReplaceFieldImport;

  useEffect(() => {
    if (!visible) {
      return;
    }

    setSearchQuery('');
    setSourceOptionsError(null);
    setSourceError(null);
    setSubmitError(null);
    setPreviewSource(null);
    setSourcePdfDoc(null);
    setSourceFields([]);
    setSourceFieldsError(null);
    setSourceName('');
    setSelectedSourcePage(1);
    setSelectedSourcePageIndexes([]);
    setImportSourceFields(false);
    setTemplateKind('my');
    setIsLoadingSource(false);
    setIsSubmitting(false);
  }, [mode, visible]);

  const sourceListConfig = useMemo(() => {
    if (mode === 'template') {
      return {
        endpoint: '/api/templates/list',
        placeholder: 'Search templates',
        loadingMessage: 'Loading templates...',
        emptyMessage: isAppendMode
          ? 'No templates are available to append.'
          : 'No templates are available for page replacement.',
        errorMessage: 'Failed to load templates.',
      };
    }

    return {
      endpoint: '/api/documents/list',
      placeholder: 'Search existing documents',
      loadingMessage: 'Loading documents...',
      emptyMessage: isAppendMode
        ? 'No existing documents are available to append.'
        : 'No existing documents are available for page replacement.',
      errorMessage: 'Failed to load existing documents.',
    };
  }, [isAppendMode, mode]);

  useEffect(() => {
    if (!visible || (mode !== 'existing' && mode !== 'template')) {
      return;
    }

    const controller = new AbortController();
    let isCancelled = false;

    const fetchSourceOptions = async () => {
      setIsLoadingSourceOptions(true);
      setSourceOptionsError(null);

      try {
        const response = await fetch(sourceListConfig.endpoint, {
          cache: 'no-store',
          credentials: 'include',
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Failed to load source items (${response.status})`);
        }

        const payload = await response.json();
        const nextSourceOptions: SourceOption[] =
          mode === 'template'
            ? Array.isArray(payload?.templates)
              ? (payload.templates as TemplateResponseItem[])
                  .filter((template) => !template?.deletedAt)
                  .filter((template) => template?.isActive !== false)
                  .map((template) => {
                    const templateId = String(template._id || '');
                    return {
                      id: templateId,
                      name: String(template.name || 'Untitled Template'),
                      fileUrl: `/api/templates/${encodeURIComponent(templateId)}`,
                      metadataUrl: `/api/templates/load?id=${encodeURIComponent(templateId)}`,
                      badge: template.isSystemTemplate === true ? 'system template' : 'my template',
                      subtitle: `Category ${String(template.category || 'Other')}`,
                      templateKind: template.isSystemTemplate === true ? 'system' : 'my',
                    };
                  })
                  .filter((template) => template.id.length > 0)
              : []
            : Array.isArray(payload?.documents)
              ? (payload.documents as ExistingDocumentResponseItem[])
                  .filter((document) => !document?.deletedAt)
                  .filter((document) => !document?.isTemplate)
                  .filter((document) => String(document?.status || '') !== 'trashed')
                  .filter((document) => String(document?.id || '') !== String(currentDocumentId || ''))
                  .map((document) => ({
                    id: String(document.id),
                    name: String(document.name || document.originalFileName || 'Untitled'),
                    fileUrl: `/api/documents/${encodeURIComponent(String(document.id))}`,
                    metadataUrl: `/api/documents/load?id=${encodeURIComponent(String(document.id))}`,
                    badge: String(document.status || 'saved').replaceAll('_', ' '),
                    subtitle: `Updated ${
                      document.updatedAt || document.createdAt
                        ? new Date(String(document.updatedAt || document.createdAt)).toLocaleString()
                        : 'recently'
                    }`,
                  }))
              : [];

        if (!isCancelled) {
          setSourceOptions(nextSourceOptions);
        }
      } catch (error) {
        if (!isCancelled && !(error instanceof DOMException && error.name === 'AbortError')) {
          setSourceOptions([]);
          setSourceOptionsError(error instanceof Error ? error.message : sourceListConfig.errorMessage);
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingSourceOptions(false);
        }
      }
    };

    void fetchSourceOptions();

    return () => {
      isCancelled = true;
      controller.abort();
    };
  }, [currentDocumentId, mode, sourceListConfig, visible]);

  useEffect(() => {
    if (mode !== 'template') {
      return;
    }

    const hasMyTemplates = sourceOptions.some((option) => option.templateKind === 'my');
    const hasSystemTemplates = sourceOptions.some((option) => option.templateKind === 'system');

    setTemplateKind((currentKind) => {
      if (currentKind === 'my' && hasMyTemplates) {
        return currentKind;
      }
      if (currentKind === 'system' && hasSystemTemplates) {
        return currentKind;
      }
      if (hasMyTemplates) {
        return 'my';
      }
      if (hasSystemTemplates) {
        return 'system';
      }
      return currentKind;
    });
  }, [mode, sourceOptions]);

  const filteredDocuments = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const scopedOptions = mode === 'template'
      ? sourceOptions.filter((option) => option.templateKind === templateKind)
      : sourceOptions;

    if (!normalizedQuery) {
      return scopedOptions;
    }

    return scopedOptions.filter((document) =>
      document.name.toLowerCase().includes(normalizedQuery)
    );
  }, [mode, searchQuery, sourceOptions, templateKind]);

  const templateScopeEmptyMessage = useMemo(() => {
    if (mode !== 'template') {
      return sourceListConfig.emptyMessage;
    }

    return templateKind === 'my'
      ? 'No personal templates are available. Switch to System Templates to browse shared templates.'
      : 'No system templates are available right now.';
  }, [mode, sourceListConfig.emptyMessage, templateKind]);

  const resetSourceSelection = () => {
    setSourceError(null);
    setSubmitError(null);
    setPreviewSource(null);
    setSourcePdfDoc(null);
    setSourceFields([]);
    setSourceFieldsError(null);
    setSourceName('');
    setSelectedSourcePage(1);
    setSelectedSourcePageIndexes([]);
    setImportSourceFields(false);
  };

  const openUploadPicker = () => {
    resetSourceSelection();
    fileInputRef.current?.click();
  };

  const getFieldImportFallbackMessage = useCallback((error: unknown) => {
    const defaultMessage = isAppendMode
      ? 'Fields could not be loaded from this source. You can still append pages without importing fields.'
      : 'Fields could not be loaded from this source. You can still replace the page without importing fields.';

    if (!(error instanceof Error) || !error.message) {
      return defaultMessage;
    }

    return `${error.message}. ${
      isAppendMode
        ? 'You can still append pages without importing fields.'
        : 'You can still replace the page without importing fields.'
    }`;
  }, [isAppendMode]);

  const loadSourceFields = useCallback(async (metadataUrl: string) => {
    const response = await fetch(metadataUrl, {
      cache: 'no-store',
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`Failed to load source fields (${response.status})`);
    }

    const payload = await response.json();
    const nextFields = mode === 'template'
      ? payload?.template?.fields
      : payload?.document?.fields;

    return dedupeFieldsById(Array.isArray(nextFields) ? nextFields : []);
  }, [mode]);

  const loadSourceDocument = useCallback(async (
    source: File | string,
    label: string,
    metadataUrl?: string
  ) => {
    setIsLoadingSource(true);
    setSourceError(null);
    setSubmitError(null);
    setSourceFields([]);
    setSourceFieldsError(null);
    setImportSourceFields(false);

    try {
      const pdfPromise = loadPdf(source);
      const sourceFieldsPromise =
        supportsSourceFieldImport && metadataUrl
          ? loadSourceFields(metadataUrl)
          : Promise.resolve<DocumentField[]>([]);

      const [loadedPdf, loadedSourceFields] = await Promise.all([
        pdfPromise,
        sourceFieldsPromise.catch((error) => {
          setSourceFieldsError(getFieldImportFallbackMessage(error));
          return [] as DocumentField[];
        }),
      ]);

      setPreviewSource(source);
      setSourcePdfDoc(loadedPdf);
      setSourceFields(loadedSourceFields);
      setSourceName(label);
      setSelectedSourcePage(1);
      setSelectedSourcePageIndexes(
        Array.from({ length: loadedPdf.getPageCount() }, (_, index) => index)
      );
    } catch (error) {
      setPreviewSource(null);
      setSourcePdfDoc(null);
      setSourceFields([]);
      setSourceFieldsError(null);
      setSourceName('');
      setSelectedSourcePageIndexes([]);
      setSourceError(error instanceof Error ? error.message : 'Failed to load the selected PDF.');
    } finally {
      setIsLoadingSource(false);
    }
  }, [getFieldImportFallbackMessage, loadSourceFields, supportsSourceFieldImport]);

  useEffect(() => {
    if (!visible || mode !== 'upload' || !initialSourceFile) {
      return;
    }

    void loadSourceDocument(initialSourceFile, initialSourceFile.name);
  }, [initialSourceFile, loadSourceDocument, mode, visible]);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    const isPdfFile =
      file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

    if (!isPdfFile) {
      setSourceError(
        isAppendMode
          ? 'Only PDF files can be appended.'
          : 'Only PDF files can be used to replace a page.'
      );
      return;
    }

    await loadSourceDocument(file, file.name);
  };

  const handleConfirm = async () => {
    if (!sourcePdfDoc) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      await onConfirm(
        isAppendMode
          ? {
              sourcePdfDoc,
              selectedPageIndexes:
                selectedSourcePageIndexes.length > 0
                  ? selectedSourcePageIndexes
                  : Array.from({ length: sourcePdfDoc.getPageCount() }, (_, index) => index),
              sourceFields,
              importSourceFields: supportsAppendFieldImport && importSourceFields,
            }
          : {
              sourcePdfDoc,
              sourcePageIndex: selectedSourcePage - 1,
              sourceFields,
              importSourceFields: supportsReplaceFieldImport && importSourceFields,
            }
      );
    } catch (error) {
      setSubmitError(
        error instanceof Error
          ? error.message
          : isAppendMode
            ? 'Failed to append the selected PDF.'
            : 'Failed to replace the page.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleAppendPageSelection = (pageIndex: number) => {
    setSelectedSourcePageIndexes((currentIndexes) => {
      if (currentIndexes.includes(pageIndex)) {
        return currentIndexes.filter((currentPageIndex) => currentPageIndex !== pageIndex);
      }

      return [...currentIndexes, pageIndex].sort((left, right) => left - right);
    });
  };

  const selectedImportableFieldCount = useMemo(() => {
    if (sourceFields.length === 0) {
      return 0;
    }

    if (supportsAppendFieldImport) {
      if (selectedSourcePageIndexes.length === 0) {
        return 0;
      }

      const selectedPageSet = new Set(selectedSourcePageIndexes.map((pageIndex) => pageIndex + 1));

      return sourceFields.filter((field) => {
        const pageNumber =
          typeof field.pageNumber === 'number' && field.pageNumber > 0 ? field.pageNumber : 1;
        return selectedPageSet.has(pageNumber);
      }).length;
    }

    if (supportsReplaceFieldImport) {
      return sourceFields.filter((field) => {
        const pageNumber =
          typeof field.pageNumber === 'number' && field.pageNumber > 0 ? field.pageNumber : 1;
        return pageNumber === selectedSourcePage;
      }).length;
    }

    return 0;
  }, [
    selectedSourcePage,
    selectedSourcePageIndexes,
    sourceFields,
    supportsAppendFieldImport,
    supportsReplaceFieldImport,
  ]);

  const appendPageCount = useMemo(() => {
    if (!isAppendMode) {
      return 0;
    }

    if (selectedSourcePageIndexes.length > 0) {
      return selectedSourcePageIndexes.length;
    }

    return sourcePdfDoc?.getPageCount() ?? 0;
  }, [isAppendMode, selectedSourcePageIndexes, sourcePdfDoc]);

  useEffect(() => {
    if (selectedImportableFieldCount === 0 && importSourceFields) {
      setImportSourceFields(false);
    }
  }, [importSourceFields, selectedImportableFieldCount]);

  const renderFieldImportOption = ({
    populatedMessage,
    emptyMessage,
  }: {
    populatedMessage: string;
    emptyMessage: string;
  }) => (
    <div className="space-y-3">
      <label className={`flex items-start gap-3 rounded-md border p-3 ${
        selectedImportableFieldCount > 0
          ? 'border-gray-200 bg-white'
          : 'border-gray-200 bg-gray-50'
      }`}>
        <input
          type="checkbox"
          className="mt-1"
          checked={importSourceFields}
          disabled={selectedImportableFieldCount === 0}
          onChange={(event) => setImportSourceFields(event.target.checked)}
        />
        <span>
          <span className="block text-sm font-medium text-gray-900">
            Import existing fields
          </span>
          <span className="mt-1 block text-xs text-gray-600">
            {selectedImportableFieldCount > 0 ? populatedMessage : emptyMessage}
          </span>
        </span>
      </label>

      {sourceFieldsError && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {sourceFieldsError}
        </div>
      )}
    </div>
  );

  const renderSourceSelection = () => {
    if (mode === 'upload') {
      return (
        <div className="space-y-4">
          <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">
              <Upload size={20} />
            </div>
            <h3 className="text-sm font-semibold text-gray-900">
              {isAppendMode ? 'Upload a PDF to append' : 'Upload a replacement PDF'}
            </h3>
            <p className="mt-2 text-sm text-gray-600">
              {isAppendMode
                ? `Choose a PDF to append after page ${targetPageNumber}. Every page in that PDF will be inserted.`
                : `Choose a PDF, then select which page should replace page ${targetPageNumber}.`}
            </p>
            <div className="mt-4">
              <Button size="sm"
                type="button"
                label="Choose PDF"
                icon={<Upload size={16} />}
                onClick={openUploadPicker}
              />
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(event) => {
                void handleFileChange(event);
              }}
            />
          </div>
          {sourceError && <p className="text-sm text-red-600">{sourceError}</p>}
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {mode === 'template' && (
          <div className="inline-flex rounded-lg bg-gray-100 p-1">
            <button
              type="button"
              className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                templateKind === 'my'
                  ? 'bg-white text-brand-700 shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
              onClick={() => setTemplateKind('my')}
            >
              My Templates
            </button>
            <button
              type="button"
              className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                templateKind === 'system'
                  ? 'bg-white text-brand-700 shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
              onClick={() => setTemplateKind('system')}
            >
              System Templates
            </button>
          </div>
        )}
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input
            id="replace-page-search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={sourceListConfig.placeholder}
            className="pl-9"
          />
        </div>
        <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
          {isLoadingSourceOptions && (
            <div className="flex items-center justify-center gap-2 rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
              <RefreshCw size={16} className="animate-spin" />
              {sourceListConfig.loadingMessage}
            </div>
          )}
          {!isLoadingSourceOptions && sourceOptionsError && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {sourceOptionsError}
            </div>
          )}
          {!isLoadingSourceOptions && !sourceOptionsError && filteredDocuments.length === 0 && (
            <div className="rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
              {templateScopeEmptyMessage}
            </div>
          )}
          {!isLoadingSourceOptions && !sourceOptionsError && filteredDocuments.map((document) => (
            <button
              key={document.id}
              type="button"
              className="flex w-full items-start justify-between rounded-md border border-gray-200 p-3 text-left transition-colors hover:border-brand-300 hover:bg-brand-50"
              onClick={() => {
                void loadSourceDocument(document.fileUrl, document.name, document.metadataUrl);
              }}
            >
              <span className="flex min-w-0 items-start gap-3">
                <span className="mt-0.5 rounded-md bg-gray-100 p-2 text-gray-600">
                  {mode === 'template' ? <LayoutTemplate size={16} /> : <FileText size={16} />}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-gray-900">
                    {document.name}
                  </span>
                  <span className="mt-1 block text-xs text-gray-500">
                    {document.subtitle}
                  </span>
                </span>
              </span>
              <span className="rounded-full bg-gray-100 px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-gray-600">
                {document.badge}
              </span>
            </button>
          ))}
        </div>
        {sourceError && <p className="text-sm text-red-600">{sourceError}</p>}
      </div>
    );
  };

  return (
    <Modal
      visible={visible}
      onClose={onClose}
      title={isAppendMode ? `Add Pages After Page ${targetPageNumber}` : `Replace Page ${targetPageNumber}`}
      className="w-[860px]"
      handleConfirm={handleConfirm}
      confirmLabel={
        isSubmitting
          ? isAppendMode
            ? 'Appending...'
            : 'Replacing...'
          : isAppendMode
            ? sourcePdfDoc
              ? `Append ${appendPageCount} ${appendPageCount === 1 ? 'Page' : 'Pages'}`
              : 'Append PDF'
            : 'Replace Page'
      }
      confirmIcon={isSubmitting ? <RefreshCw size={16} className="animate-spin" /> : undefined}
      confirmDisabled={!sourcePdfDoc || isLoadingSource || isSubmitting || (isAppendMode && appendPageCount === 0)}
      cancelLabel="Cancel"
      cancelDisabled={isSubmitting}
      closeOnEsc
    >
      <div className="space-y-4">
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {isAppendMode
            ? supportsAppendFieldImport
              ? `Choose the pages to insert after page ${targetPageNumber}. You can also import fields from the selected pages.`
              : `All pages from the selected PDF will be inserted after page ${targetPageNumber}.`
            : `Replacing page ${targetPageNumber} removes every field currently placed on that page.`}
        </div>

        {!sourcePdfDoc && !isLoadingSource && renderSourceSelection()}

        {isLoadingSource && (
          <div className="flex items-center justify-center gap-2 rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
            <RefreshCw size={16} className="animate-spin" />
            {isAppendMode ? 'Loading document to append...' : 'Loading replacement document...'}
          </div>
        )}

        {sourcePdfDoc && previewSource && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-gray-200 bg-gray-50 p-3">
              <div>
                <p className="text-sm font-semibold text-gray-900">{sourceName}</p>
                <p className="mt-1 text-sm text-gray-600">
                  {isAppendMode
                    ? supportsAppendFieldImport
                      ? `${appendPageCount} of ${sourcePdfDoc.getPageCount()} pages selected for insertion after page ${targetPageNumber}.`
                      : `${sourcePdfDoc.getPageCount()} ${sourcePdfDoc.getPageCount() === 1 ? 'page will' : 'pages will'} be inserted after page ${targetPageNumber}.`
                    : `Select the source page to insert in place of page ${targetPageNumber}.`}
                </p>
              </div>
              <Button size="sm"
                type="button"
                inverted
                label={
                  mode === 'upload'
                    ? 'Choose Another PDF'
                    : mode === 'template'
                      ? 'Choose Another Template'
                      : 'Choose Another Document'
                }
                onClick={mode === 'upload' ? openUploadPicker : resetSourceSelection}
              />
            </div>

            {supportsAppendFieldImport && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-gray-200 bg-white p-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {appendPageCount} of {sourcePdfDoc.getPageCount()} pages selected
                    </p>
                    <p className="mt-1 text-xs text-gray-600">
                      Toggle the pages you want to insert after page {targetPageNumber}.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm"
                      type="button"
                      inverted
                      label="Select All"
                      onClick={() => setSelectedSourcePageIndexes(
                        Array.from({ length: sourcePdfDoc.getPageCount() }, (_, index) => index)
                      )}
                    />
                    <Button size="sm"
                      type="button"
                      inverted
                      label="Clear"
                      onClick={() => setSelectedSourcePageIndexes([])}
                    />
                  </div>
                </div>

                {renderFieldImportOption({
                  populatedMessage: `${selectedImportableFieldCount} ${
                    selectedImportableFieldCount === 1 ? 'field' : 'fields'
                  } will be copied onto the selected pages. Recipient assignments are kept only when the recipient already exists in this document.`,
                  emptyMessage: 'No reusable fields were found on the selected pages.',
                })}
              </div>
            )}

            {supportsReplaceFieldImport && (
              renderFieldImportOption({
                populatedMessage: `${selectedImportableFieldCount} ${
                  selectedImportableFieldCount === 1 ? 'field' : 'fields'
                } from the selected source page will replace the current page fields. Recipient assignments are kept only when the recipient already exists in this document.`,
                emptyMessage: 'No reusable fields were found on the selected source page.',
              })
            )}

            <Document
              file={previewSource}
              loading={
                <div className="rounded-md border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
                  Preparing page previews...
                </div>
              }
              error={
                <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                  The selected PDF loaded, but its page previews could not be rendered.
                </div>
              }
            >
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
                {Array.from({ length: sourcePdfDoc.getPageCount() }, (_, index) => {
                  const pageNumber = index + 1;
                  const isSelected = selectedSourcePage === pageNumber;
                  const isAppendPageSelected = selectedSourcePageIndexes.includes(index);

                  if (supportsAppendFieldImport) {
                    return (
                      <button
                        key={pageNumber}
                        type="button"
                        aria-label={`Toggle page ${pageNumber}`}
                        aria-pressed={isAppendPageSelected}
                        className={`rounded-lg border p-3 text-left transition-colors ${
                          isAppendPageSelected
                            ? 'border-brand-500 bg-brand-50 shadow-xs'
                            : 'border-gray-200 bg-white hover:border-brand-300 hover:bg-brand-50'
                        }`}
                        onClick={() => toggleAppendPageSelection(index)}
                      >
                        <div className="flex justify-center rounded-md bg-gray-100 p-2">
                          <Page
                            pageNumber={pageNumber}
                            width={180}
                            renderAnnotationLayer={false}
                            renderTextLayer={false}
                            loading="Loading page..."
                          />
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-3">
                          <span className="text-sm font-medium text-gray-900">
                            Page {pageNumber}
                          </span>
                          <span className={`rounded-full px-2 py-1 text-[11px] font-medium uppercase tracking-wide ${
                            isAppendPageSelected
                              ? 'bg-brand-100 text-brand-700'
                              : 'bg-gray-100 text-gray-500'
                          }`}>
                            {isAppendPageSelected ? 'Selected' : 'Skipped'}
                          </span>
                        </div>
                      </button>
                    );
                  }

                  if (isAppendMode) {
                    return (
                      <div
                        key={pageNumber}
                        className="rounded-lg border border-gray-200 bg-white p-3 text-left"
                      >
                        <div className="flex justify-center rounded-md bg-gray-100 p-2">
                          <Page
                            pageNumber={pageNumber}
                            width={180}
                            renderAnnotationLayer={false}
                            renderTextLayer={false}
                            loading="Loading page..."
                          />
                        </div>
                        <div className="mt-3 text-sm font-medium text-gray-900">
                          Page {pageNumber}
                        </div>
                      </div>
                    );
                  }

                  return (
                    <button
                      key={pageNumber}
                      type="button"
                      aria-label={`Select source page ${pageNumber}`}
                      aria-pressed={isSelected}
                      className={`rounded-lg border p-3 text-left transition-colors ${
                        isSelected
                          ? 'border-brand-500 bg-brand-50 shadow-xs'
                          : 'border-gray-200 bg-white hover:border-brand-300 hover:bg-brand-50'
                      }`}
                      onClick={() => setSelectedSourcePage(pageNumber)}
                    >
                      <div className="flex justify-center rounded-md bg-gray-100 p-2">
                        <Page
                          pageNumber={pageNumber}
                          width={180}
                          renderAnnotationLayer={false}
                          renderTextLayer={false}
                          loading="Loading page..."
                        />
                      </div>
                      <div className="mt-3 text-sm font-medium text-gray-900">
                        Page {pageNumber}
                      </div>
                    </button>
                  );
                })}
              </div>
            </Document>
          </div>
        )}

        {submitError && (
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {submitError}
          </div>
        )}
      </div>
    </Modal>
  );
};

export default ReplacePageDialog;
