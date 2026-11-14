'use client';

import Link from 'next/link';
import { AlertTriangle, CheckCircle2, FileText, Users } from 'lucide-react';

import { evaluateTemplateReadiness } from '@/lib/template-readiness';
import type { TemplateBuilderTemplate } from './template-builder-types';

interface TemplateReviewPanelProps {
  template: TemplateBuilderTemplate;
  fieldsHref: string;
}

export default function TemplateReviewPanel({
  template,
  fieldsHref,
}: TemplateReviewPanelProps) {
  const fields = template.fields || [];
  const roles = template.defaultSigners || [];
  const {
    ready,
    missingRoles,
    missingFields,
    layoutNeedsReview,
    unassignedFields,
    orphanedFields,
    rolesMissingFields,
  } = evaluateTemplateReadiness({
    fields,
    roles,
    fieldLayoutStatus: template.fieldLayoutStatus,
  });
  const contentLabel = template.editableContent
    ? `${template.editableContent.blocks.length} content section${template.editableContent.blocks.length === 1 ? '' : 's'}`
    : `${template.pageCount || 1} PDF page${template.pageCount === 1 ? '' : 's'}`;

  const checks = [
    { label: 'Content', value: contentLabel, complete: true },
    { label: 'Roles', value: `${roles.length} configured`, complete: !missingRoles && rolesMissingFields === 0 },
    { label: 'Fields', value: `${fields.length} placed`, complete: !missingFields && unassignedFields === 0 && orphanedFields === 0 },
    {
      label: 'Field layout',
      value: layoutNeedsReview ? 'Review required after content changes' : 'Current',
      complete: !layoutNeedsReview,
    },
    {
      label: 'Visibility',
      value: template.sharingScope === 'workspace' ? 'Workspace' : 'Private',
      complete: true,
    },
  ];

  return (
    <div className="mx-auto w-full max-w-4xl p-4 sm:p-8">
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-5 sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold text-slate-950">Template readiness</h2>
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${ready ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>
              {ready
                ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                : <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />}
              {ready ? 'Ready to use' : 'Setup required'}
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            Check the content, reusable roles, and field placement before creating an agreement.
          </p>
        </div>

        <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
          {checks.map((check) => (
            <div key={check.label} className="flex items-start gap-3 rounded-lg border border-slate-200 p-4">
              {check.complete
                ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
                : <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />}
              <div>
                <p className="text-sm font-semibold text-slate-900">{check.label}</p>
                <p className="mt-0.5 text-sm text-slate-600">{check.value}</p>
              </div>
            </div>
          ))}
        </div>

        {!ready && (
          <div className="mx-5 mb-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 sm:mx-6 sm:mb-6">
            <p className="font-semibold">Setup required</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {missingRoles && <li>Add at least one reusable recipient role.</li>}
              {missingFields && <li>Place at least one signing field and assign it to a role.</li>}
              {layoutNeedsReview && <li>Review and save every field against the latest content layout.</li>}
              {unassignedFields > 0 && <li>Assign {unassignedFields} field{unassignedFields === 1 ? '' : 's'} to a role.</li>}
              {orphanedFields > 0 && <li>Reassign {orphanedFields} field{orphanedFields === 1 ? '' : 's'} whose role no longer exists.</li>}
              {!missingFields && rolesMissingFields > 0 && <li>Add a field for {rolesMissingFields} signer or approver role{rolesMissingFields === 1 ? '' : 's'}.</li>}
            </ul>
            {!template.isSystemTemplate && (
              <Link
                href={fieldsHref}
                className="mt-3 inline-flex font-semibold text-brand-700 hover:text-brand-800"
              >
                Open roles and fields
              </Link>
            )}
          </div>
        )}

        <div className="flex items-center gap-4 border-t border-slate-200 px-5 py-4 text-sm text-slate-600 sm:px-6">
          <span className="inline-flex items-center gap-1.5"><FileText className="h-4 w-4" />{fields.length} fields</span>
          <span className="inline-flex items-center gap-1.5"><Users className="h-4 w-4" />{roles.length} roles</span>
        </div>
      </div>
    </div>
  );
}
