'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileText,
  LockKeyhole,
  Users,
  Variable,
} from 'lucide-react';

import type { PDFViewerPreviewProps } from './builder/PDFViewerPreview';
import type { DocumentField } from '@/types/types';
import type { EditableTemplateContent } from '@/types/template-content';
import { evaluateTemplateReadiness } from '@/lib/template-readiness';

const PDFViewerPreview = dynamic<PDFViewerPreviewProps>(
  () => import('./builder/PDFViewerPreview'),
  { ssr: false }
);

import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

type TemplateOverviewRole = {
  id?: string;
  name?: string;
  role: 'signer' | 'approver' | 'viewer';
  order: number;
};

export interface TemplateOverviewData {
  description?: string;
  category?: string;
  jurisdiction?: string;
  isSystemTemplate?: boolean;
  sharingScope?: 'private' | 'workspace';
  fields?: DocumentField[];
  defaultSigners?: TemplateOverviewRole[];
  editableContent?: EditableTemplateContent | null;
  pageCount?: number;
  fileSize?: number;
  tags?: string[];
  updatedAt?: Date | string;
  fieldLayoutStatus?: 'current' | 'needs_review';
}

export interface TemplatePreviewProps {
  templateUrl: string;
  templateName: string;
  template?: TemplateOverviewData;
  onClose?: () => void;
}

const PREVIEW_PAGE_WIDTH = 890;
const FIELD_COLORS = ['#2563eb', '#7c3aed', '#059669', '#dc2626', '#d97706', '#0891b2'];

const titleCase = (value: string) =>
  value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());

const formatBytes = (bytes?: number) => {
  if (!bytes || bytes <= 0) return 'Not available';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatUpdatedAt = (value?: Date | string) => {
  if (!value) return 'Not available';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not available';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
};

const rectNumber = (rect: DocumentField['pageRect'], key: 'x' | 'y' | 'left' | 'top' | 'width') => {
  if (!rect || typeof rect !== 'object') return undefined;
  const value = (rect as unknown as Record<string, unknown>)[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
};

function TemplatePreview({ templateUrl, templateName, template }: TemplatePreviewProps) {
  const [numPages, setNumPages] = useState<number>(template?.pageCount || 0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(0.72);
  const [activeTab, setActiveTab] = useState<'document' | 'configuration'>('configuration');

  const fields = useMemo(() => template?.fields || [], [template?.fields]);
  const roles = useMemo(
    () => [...(template?.defaultSigners || [])].sort((a, b) => a.order - b.order),
    [template?.defaultSigners]
  );
  const variables = template?.editableContent?.variables || [];
  const readiness = evaluateTemplateReadiness({
    fields,
    roles,
    fieldLayoutStatus: template?.fieldLayoutStatus,
  });
  const roleIndexById = useMemo(
    () => new Map(roles.map((role, index) => [String(role.id || `role_${index + 1}`), index])),
    [roles]
  );

  const handleDocumentLoadSuccess = ({ numPages: loadedPageCount }: { numPages: number }) => {
    setNumPages(loadedPageCount);
    setCurrentPage((page) => Math.min(Math.max(1, page), loadedPageCount));
  };

  const visiblePageCount = Math.max(1, numPages || template?.pageCount || 1);
  const pages = [Math.min(currentPage, visiblePageCount)];

  const renderFieldOverlay = (pageNumber: number) => {
    const pageFields = fields.filter((field) => (field.pageNumber || 1) === pageNumber);
    if (pageFields.length === 0) return null;

    return (
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-label={`Fields on page ${pageNumber}`}>
        {pageFields.map((field, index) => {
          const sourceWidth = rectNumber(field.pageRect, 'width') || PREVIEW_PAGE_WIDTH;
          const pageLeft = rectNumber(field.pageRect, 'left') ?? rectNumber(field.pageRect, 'x') ?? 0;
          const pageTop = rectNumber(field.pageRect, 'top') ?? rectNumber(field.pageRect, 'y') ?? 0;
          const previewRatio = (PREVIEW_PAGE_WIDTH * scale) / sourceWidth;
          const roleIndex = field.recipientId ? roleIndexById.get(String(field.recipientId)) : undefined;
          const color = roleIndex === undefined ? '#64748b' : FIELD_COLORS[roleIndex % FIELD_COLORS.length];
          const label = field.settings?.label || titleCase(field.type);

          return (
            <div
              key={field.id || `${pageNumber}-${index}`}
              className="absolute flex min-h-5 items-center overflow-hidden rounded border-2 bg-white/90 px-1 text-[10px] font-semibold shadow-sm"
              style={{
                left: Math.max(0, (field.x - pageLeft) * previewRatio),
                top: Math.max(0, (field.y - pageTop) * previewRatio),
                width: Math.max(24, field.width * previewRatio),
                height: Math.max(20, field.height * previewRatio),
                borderColor: color,
                color,
              }}
              title={`${label}${field.required === false ? '' : ' — required'}`}
            >
              <span className="truncate">{label}{field.required === false ? '' : ' *'}</span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex min-h-0 flex-col">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Template overview" className="inline-flex rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'configuration'}
            onClick={() => setActiveTab('configuration')}
            className={`rounded-md px-3 py-2 text-sm font-medium transition ${activeTab === 'configuration' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600 hover:text-slate-950'}`}
          >
            Configuration
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'document'}
            onClick={() => setActiveTab('document')}
            className={`rounded-md px-3 py-2 text-sm font-medium transition ${activeTab === 'document' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-600 hover:text-slate-950'}`}
          >
            Document &amp; fields
          </button>
        </div>

        <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${readiness.ready ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>
          {readiness.ready
            ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            : <AlertTriangle className="h-4 w-4" aria-hidden="true" />}
          {readiness.ready ? 'Ready to use' : 'Setup required'}
        </span>
      </div>

      {activeTab === 'document' ? (
        <div role="tabpanel" className="min-h-0">
          <div className="max-h-[52vh] min-h-72 overflow-auto rounded-lg border border-slate-200 bg-slate-100 p-4">
            <PDFViewerPreview
              file={templateUrl}
              onLoadSuccess={handleDocumentLoadSuccess}
              pages={pages}
              renderPages
              scale={scale}
              renderPageOverlay={renderFieldOverlay}
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Previous page"
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="rounded-md p-2 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <span className="min-w-20 text-center text-sm text-slate-600">{currentPage} / {visiblePageCount}</span>
              <button
                type="button"
                aria-label="Next page"
                onClick={() => setCurrentPage(Math.min(visiblePageCount, currentPage + 1))}
                disabled={currentPage >= visiblePageCount}
                className="rounded-md p-2 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500">{fields.filter((field) => (field.pageNumber || 1) === currentPage).length} configured fields on this page</p>

            <div className="flex items-center gap-2">
              <button type="button" aria-label="Zoom out" onClick={() => setScale(Math.max(0.45, scale - 0.1))} className="rounded-md border border-slate-300 px-3 py-1 text-sm hover:bg-white">−</button>
              <span className="min-w-12 text-center text-sm text-slate-600">{Math.round(scale * 100)}%</span>
              <button type="button" aria-label="Zoom in" onClick={() => setScale(Math.min(1.2, scale + 0.1))} className="rounded-md border border-slate-300 px-3 py-1 text-sm hover:bg-white">+</button>
            </div>
          </div>
        </div>
      ) : (
        <div role="tabpanel" className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-lg border border-slate-200 bg-white p-4" aria-labelledby="template-roles-heading">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 id="template-roles-heading" className="font-semibold text-slate-950">Roles and fields</h3>
                <p className="mt-1 text-sm text-slate-600">Reusable roles only; recipient contact details are not shown.</p>
              </div>
              <span className="text-sm text-slate-500">{roles.length} roles · {fields.length} fields</span>
            </div>

            <div className="mt-4 space-y-2">
              {roles.length > 0 ? roles.map((role, index) => {
                const roleId = String(role.id || `role_${index + 1}`);
                const fieldCount = fields.filter((field) => String(field.recipientId || '') === roleId).length;
                return (
                  <div key={roleId} className="flex items-center gap-3 rounded-lg border border-slate-200 p-3">
                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: FIELD_COLORS[index % FIELD_COLORS.length] }} aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">{role.name || `${titleCase(role.role)} ${index + 1}`}</p>
                      <p className="text-xs text-slate-500">{titleCase(role.role)} · {fieldCount} assigned field{fieldCount === 1 ? '' : 's'}</p>
                    </div>
                  </div>
                );
              }) : (
                <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">No reusable roles configured.</p>
              )}
            </div>

            {!readiness.ready && (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                <p className="font-semibold">Setup still required</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {readiness.missingRoles && <li>Add at least one reusable recipient role.</li>}
                  {readiness.missingFields && <li>Place at least one signing field and assign it to a role.</li>}
                  {readiness.layoutNeedsReview && <li>Review field placement against the latest document layout.</li>}
                  {readiness.unassignedFields > 0 && <li>Assign {readiness.unassignedFields} field{readiness.unassignedFields === 1 ? '' : 's'} to a role.</li>}
                  {readiness.orphanedFields > 0 && <li>Reconnect {readiness.orphanedFields} field{readiness.orphanedFields === 1 ? '' : 's'} to an existing role.</li>}
                  {!readiness.missingFields && readiness.rolesMissingFields > 0 && <li>Add fields for {readiness.rolesMissingFields} signer or approver role{readiness.rolesMissingFields === 1 ? '' : 's'}.</li>}
                </ul>
              </div>
            )}
          </section>

          <div className="space-y-4">
            <section className="rounded-lg border border-slate-200 bg-white p-4" aria-labelledby="template-details-heading">
              <h3 id="template-details-heading" className="font-semibold text-slate-950">Template details</h3>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div><dt className="text-slate-500">Category</dt><dd className="mt-0.5 font-medium text-slate-900">{template?.category || 'Other'}</dd></div>
                <div><dt className="text-slate-500">Jurisdiction</dt><dd className="mt-0.5 font-medium text-slate-900">{template?.jurisdiction || 'International'}</dd></div>
                <div><dt className="text-slate-500">Visibility</dt><dd className="mt-0.5 font-medium text-slate-900">{template?.isSystemTemplate ? 'System library' : template?.sharingScope === 'workspace' ? 'Workspace' : 'Private'}</dd></div>
                <div><dt className="text-slate-500">Updated</dt><dd className="mt-0.5 font-medium text-slate-900">{formatUpdatedAt(template?.updatedAt)}</dd></div>
                <div><dt className="text-slate-500">Pages</dt><dd className="mt-0.5 font-medium text-slate-900">{numPages || template?.pageCount || 1}</dd></div>
                <div><dt className="text-slate-500">File size</dt><dd className="mt-0.5 font-medium text-slate-900">{formatBytes(template?.fileSize)}</dd></div>
              </dl>
              {template?.description && <p className="mt-4 border-t border-slate-100 pt-3 text-sm text-slate-600">{template.description}</p>}
            </section>

            <section className="rounded-lg border border-slate-200 bg-white p-4" aria-labelledby="template-content-heading">
              <h3 id="template-content-heading" className="font-semibold text-slate-950">Configuration summary</h3>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex items-center justify-between gap-3"><span className="inline-flex items-center gap-2 text-slate-600"><FileText className="h-4 w-4" />Fields</span><strong className="text-slate-900">{fields.length}</strong></div>
                <div className="flex items-center justify-between gap-3"><span className="inline-flex items-center gap-2 text-slate-600"><Users className="h-4 w-4" />Roles</span><strong className="text-slate-900">{roles.length}</strong></div>
                <div className="flex items-center justify-between gap-3"><span className="inline-flex items-center gap-2 text-slate-600"><Variable className="h-4 w-4" />Variables</span><strong className="text-slate-900">{variables.length}</strong></div>
                <div className="flex items-center justify-between gap-3"><span className="inline-flex items-center gap-2 text-slate-600"><LockKeyhole className="h-4 w-4" />Required variables</span><strong className="text-slate-900">{variables.filter((variable) => variable.required).length}</strong></div>
              </div>
              {variables.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                  {variables.map((variable) => (
                    <span key={variable.key} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">
                      {variable.label}{variable.required ? ' *' : ''}
                    </span>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      <p className="sr-only">Template overview for {templateName}</p>
    </div>
  );
}

export default TemplatePreview;
