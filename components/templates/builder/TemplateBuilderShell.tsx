'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FilePenLine,
  FileSignature,
  ListChecks,
  Loader2,
  Settings2,
} from 'lucide-react';
import toast from 'react-hot-toast';

import { Button } from '@ui';
import DocumentEditor from '@/components/builder/DocumentEditor';
import TemplateContentEditor from '@/components/templates/TemplateContentEditor';
import { useTemplates } from '@/hooks/useTemplates';
import { buildTemplateRecipients } from '@/lib/template-recipients';
import {
  buildDocumentBuilderHref,
  buildTemplateBuilderHref,
  buildTemplateLoginHref,
  getTemplateReturnHref,
  resolveTemplateNavigationContext,
  type TemplateNavigationWorkspace,
} from '@/lib/template-navigation';
import { evaluateTemplateReadiness } from '@/lib/template-readiness';
import type { Recipient } from '@/types/types';
import TemplateReviewPanel from './TemplateReviewPanel';
import TemplateNameEditor from './TemplateNameEditor';
import TemplateSettingsPanel from './TemplateSettingsPanel';
import type { TemplateBuilderTemplate, TemplateBuilderWorkspace } from './template-builder-types';

interface TemplateBuilderShellProps {
  templateId: string;
  initialTemplate?: TemplateBuilderTemplate | null;
}

const workspaceConfig: Record<TemplateBuilderWorkspace, {
  label: string;
  shortLabel: string;
  icon: typeof FilePenLine;
}> = {
  content: { label: 'Content', shortLabel: 'Content', icon: FilePenLine },
  fields: { label: 'Roles & fields', shortLabel: 'Fields', icon: FileSignature },
  review: { label: 'Readiness', shortLabel: 'Readiness', icon: ListChecks },
  settings: { label: 'Settings', shortLabel: 'Settings', icon: Settings2 },
};

const isWorkspace = (value: string | null): value is TemplateBuilderWorkspace =>
  value === 'content' || value === 'fields' || value === 'review' || value === 'settings';

const normalizeTemplate = (raw: Partial<TemplateBuilderTemplate>, templateId: string): TemplateBuilderTemplate => ({
  _id: String(raw._id || raw.templateId || templateId),
  templateId: String(raw.templateId || raw._id || templateId),
  name: typeof raw.name === 'string' && raw.name.trim() ? raw.name : 'Untitled template',
  description: typeof raw.description === 'string' ? raw.description : '',
  category: typeof raw.category === 'string' && raw.category ? raw.category : 'Other',
  jurisdiction: raw.jurisdiction,
  isSystemTemplate: Boolean(raw.isSystemTemplate),
  sharingScope: raw.sharingScope === 'workspace' ? 'workspace' : 'private',
  userId: raw.userId,
  orgId: raw.orgId,
  fields: Array.isArray(raw.fields) ? raw.fields : [],
  defaultSigners: Array.isArray(raw.defaultSigners) ? raw.defaultSigners : [],
  editableContent: raw.editableContent || null,
  templateFileUrl: raw.templateFileUrl || `/api/templates/${encodeURIComponent(templateId)}`,
  thumbnailUrl: raw.thumbnailUrl,
  pageCount: raw.pageCount,
  fileSize: raw.fileSize,
  tags: Array.isArray(raw.tags) ? raw.tags : [],
  updatedAt: raw.updatedAt,
  fieldLayoutStatus: raw.fieldLayoutStatus === 'needs_review' ? 'needs_review' : 'current',
  layoutRevision: raw.layoutRevision,
  fieldLayoutRevision: raw.fieldLayoutRevision,
});

export default function TemplateBuilderShell({ templateId, initialTemplate = null }: TemplateBuilderShellProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { createDocumentFromTemplate, duplicateTemplate } = useTemplates();
  const [template, setTemplate] = useState<TemplateBuilderTemplate | null>(() =>
    initialTemplate ? normalizeTemplate(initialTemplate, templateId) : null
  );
  const [loading, setLoading] = useState(!initialTemplate);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [creatingAgreement, setCreatingAgreement] = useState(false);
  const [customizing, setCustomizing] = useState(false);
  const createAgreementLockRef = useRef(false);

  const requestedWorkspace = searchParams.get('workspace');
  // `review` remains the canonical value for existing links; accept the clearer
  // `readiness` alias without breaking bookmarked URLs.
  const normalizedRequestedWorkspace = requestedWorkspace === 'readiness'
    ? 'review'
    : requestedWorkspace;
  const defaultWorkspace: TemplateBuilderWorkspace = template?.editableContent ? 'content' : 'fields';
  const selectedWorkspace: TemplateBuilderWorkspace = isWorkspace(normalizedRequestedWorkspace)
    ? normalizedRequestedWorkspace
    : defaultWorkspace;
  const workspace: TemplateBuilderWorkspace = template?.isSystemTemplate
    ? 'review'
    : selectedWorkspace === 'content' && !template?.editableContent
      ? 'fields'
      : selectedWorkspace;
  const serializedNavigationOrigin = searchParams.get('templateOrigin');
  const serializedNavigationView = searchParams.get('templateView');
  const serializedNavigationReturnTo = searchParams.get('templateReturnTo');
  const navigationContext = useMemo(
    () => {
      const params = new URLSearchParams();
      if (serializedNavigationOrigin) params.set('templateOrigin', serializedNavigationOrigin);
      if (serializedNavigationView) params.set('templateView', serializedNavigationView);
      if (serializedNavigationReturnTo) params.set('templateReturnTo', serializedNavigationReturnTo);
      return resolveTemplateNavigationContext(params, {
        origin: 'templates',
        view: template?.isSystemTemplate ? 'system' : 'my',
      });
    },
    [serializedNavigationOrigin, serializedNavigationReturnTo, serializedNavigationView, template?.isSystemTemplate]
  );
  const returnHref = getTemplateReturnHref(navigationContext);
  const templateBuilderHref = useCallback((
    resourceId: string,
    nextWorkspace: TemplateNavigationWorkspace
  ) => buildTemplateBuilderHref(resourceId, nextWorkspace, navigationContext), [navigationContext]);
  const workspaceRef = useRef(workspace);

  useEffect(() => {
    workspaceRef.current = workspace;
  }, [workspace]);

  const refreshTemplate = useCallback(async () => {
    try {
      const response = await fetch(`/api/templates/load?id=${encodeURIComponent(templateId)}`, {
        cache: 'no-store',
        credentials: 'include',
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body?.template) {
        if (response.status === 401) {
          router.replace(buildTemplateLoginHref(templateBuilderHref(templateId, workspaceRef.current)));
          return;
        }
        if (response.status === 403) {
          router.replace(returnHref);
          return;
        }
        throw new Error(body?.message || 'Unable to load this template');
      }
      setTemplate(normalizeTemplate(body.template, templateId));
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Unable to load this template');
    } finally {
      setLoading(false);
    }
  }, [returnHref, router, templateBuilderHref, templateId]);

  useEffect(() => {
    void refreshTemplate();
  }, [refreshTemplate]);

  const recipients = useMemo(() => {
    if (!template) return [] as Recipient[];
    return buildTemplateRecipients(template._id, template.defaultSigners, template.fields) as Recipient[];
  }, [template]);

  const workspaceTabs = useMemo(() => {
    if (!template || template.isSystemTemplate) return ['review'] as TemplateBuilderWorkspace[];
    const tabs: TemplateBuilderWorkspace[] = [];
    if (template.editableContent) tabs.push('content');
    tabs.push('fields', 'review', 'settings');
    return tabs;
  }, [template]);

  const openCreatedAgreement = (result: { documentId: string; guestId?: string | null }) => {
    router.push(buildDocumentBuilderHref(result.documentId, navigationContext, result.guestId));
  };

  const createAgreement = async () => {
    if (!template || template.fieldLayoutStatus === 'needs_review' || createAgreementLockRef.current || creatingAgreement) return;
    createAgreementLockRef.current = true;
    setCreatingAgreement(true);
    try {
      const documentName = `${template.name} - ${new Date().toLocaleDateString()}`;
      const result = await createDocumentFromTemplate(
        template._id,
        documentName,
        undefined,
        undefined,
        true
      );
      if (!result) throw new Error('Unable to create an agreement from this template');
      toast.success('Envelope opened in the Builder');
      openCreatedAgreement(result);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to Create Envelope');
      router.replace(templateBuilderHref(template._id, 'review'));
      await refreshTemplate();
    } finally {
      setCreatingAgreement(false);
      createAgreementLockRef.current = false;
    }
  };

  const customizeSystemTemplate = async () => {
    if (!template?.isSystemTemplate) return;
    setCustomizing(true);
    try {
      const copy = await duplicateTemplate(template._id);
      if (!copy?._id) throw new Error('Unable to create an editable copy');
      toast.success('Private editable copy created.');
      router.push(templateBuilderHref(copy._id, copy.editableContent ? 'content' : 'fields'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to customize this template');
    } finally {
      setCustomizing(false);
    }
  };

  if (loading && !template) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 text-slate-600" role="status">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />
        Loading Template Builder…
      </div>
    );
  }

  if (!template || loadError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
        <div className="max-w-md rounded-xl border border-red-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-lg font-semibold text-slate-950">Template unavailable</h1>
          <p className="mt-2 text-sm text-slate-600">{loadError || 'This template could not be loaded.'}</p>
          <div className="mt-5 flex justify-center gap-2">
            <Button variant="outline" label="Back to templates" onClick={() => router.push(returnHref)} />
            <Button label="Try again" onClick={() => void refreshTemplate()} />
          </div>
        </div>
      </div>
    );
  }

  const needsReview = template.fieldLayoutStatus === 'needs_review';
  const readiness = evaluateTemplateReadiness({
    fields: template.fields,
    roles: template.defaultSigners,
    fieldLayoutStatus: template.fieldLayoutStatus,
  });

  const templateNavigation = (
   
      <nav aria-label="Template setup" className="flex min-w-max gap-1 overflow-x-auto">
        {workspaceTabs.map((tab) => {
          const config = workspaceConfig[tab];
          const Icon = config.icon;
          const active = workspace === tab;
          return (
            <Link
              key={tab}
              href={templateBuilderHref(template._id, tab)}
              aria-current={active ? 'page' : undefined}
              className={`inline-flex min-h-8 items-center gap-2 border-b-2 px-3 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500 ${active ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-950'}`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">{config.label}</span>
              <span className="sm:hidden">{config.shortLabel}</span>
              {tab === 'review' && !readiness.ready && <span className="h-2 w-2 rounded-full bg-amber-500" aria-label="Setup required" />}
            </Link>
          );
        })}
      </nav>

  );

  return (
    <div data-testid="template-builder-shell" className="flex min-h-screen flex-col bg-slate-100 lg:h-screen lg:min-h-0">
      <section aria-label="Template Builder workspace" className="min-h-0 flex-1 overflow-hidden">
        <div data-testid="template-builder-workspace-frame" className="flex h-full min-h-0 flex-col">
          <div data-testid="template-builder-summary" className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white p-2">
          <Link
            href={returnHref}
            aria-label={`Back to ${navigationContext.view === 'system' ? 'System' : navigationContext.view === 'all' ? 'All' : 'My'} Templates`}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </Link>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <TemplateNameEditor
                templateId={template._id}
                name={template.name}
                editable={!template.isSystemTemplate}
                onRenamed={(name) => setTemplate((current) => current ? { ...current, name } : current)}
              />
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${template.isSystemTemplate ? 'bg-violet-50 text-violet-700' : 'bg-slate-100 text-slate-700'}`}>
                {template.isSystemTemplate ? 'System template' : 'Template'}
              </span>
              {!readiness.ready ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                  <AlertTriangle className="h-3 w-3" aria-hidden="true" />Setup required
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                  <CheckCircle2 className="h-3 w-3" aria-hidden="true" />Ready to use
                </span>
              )}
            </div>
            <p className="hidden text-xs text-slate-500 sm:block">
              {template.isSystemTemplate
                ? 'Use the shared setup as-is when ready, or create a private editable copy.'
                : 'Prepare reusable content, roles, and signing fields in one workspace, that can be modified in the builder. '}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {template.isSystemTemplate ? (
              <>
                {readiness.ready && (
                  <Button
                    size="sm"
                    label={creatingAgreement ? 'Creating…' : 'Create Envelope'}
                    disabled={creatingAgreement || customizing}
                    title="Create an envelope and continue configuring it in Builder."
                    onClick={() => void createAgreement()}
                  />
                )}
                <Button
                  variant={readiness.ready ? 'outline' : undefined}
                  size="sm"
                  label={customizing ? 'Creating private copy…' : 'Customize'}
                  disabled={customizing || creatingAgreement}
                  onClick={() => void customizeSystemTemplate()}
                />
              </>
            ) : (
              <Button
                size="sm"
                label={creatingAgreement ? 'Creating…' : 'Create Envelope'}
                disabled={creatingAgreement || !readiness.ready}
                title={!readiness.ready
                  ? 'Complete the template readiness checks before creating an agreement.'
                  : 'Create an envelope and continue configuring it in Builder.'}
                onClick={() => void createAgreement()}
              />
            )}
          </div>
          </div>

            <div data-testid="template-builder-workspace" className="min-h-0 flex-1 overflow-auto">
              {workspace !== 'content' && workspace !== 'fields' && (
                <header data-testid="template-builder-lower-header" className="sticky top-0 z-30 flex border-b border-slate-200 bg-white p-2">
                  {templateNavigation}
                </header>
              )}
              {workspace === 'content' && template.editableContent && (
                <TemplateContentEditor
                  templateId={template._id}
                  embedded
                  toolbarLeading={templateNavigation}
                  onSaved={refreshTemplate}
                  onContinueToFields={() => router.push(templateBuilderHref(template._id, 'fields'))}
                />
              )}

              {workspace === 'fields' && !template.isSystemTemplate && (
                <DocumentEditor
                  key={`${template._id}:${template.layoutRevision || 0}:${template.updatedAt || ''}`}
                  documentId={template._id}
                  initialFileUrl={`/api/templates/${encodeURIComponent(template._id)}`}
                  initialResourceName={template.name}
                  initialFields={template.fields}
                  initialRecipients={recipients}
                  isTemplateEditor
                  templateNavigation={templateNavigation}
                  templateFieldReviewRequired={needsReview}
                  onTemplateSaved={refreshTemplate}
                />
              )}

              {workspace === 'review' && (
                <TemplateReviewPanel
                  template={template}
                  fieldsHref={templateBuilderHref(template._id, 'fields')}
                />
              )}

              {workspace === 'settings' && !template.isSystemTemplate && (
                <TemplateSettingsPanel template={template} onSaved={refreshTemplate} />
              )}
          </div>
        </div>
      </section>

    </div>
  );
}
