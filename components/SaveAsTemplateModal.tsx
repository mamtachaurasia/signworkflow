'use client';

import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { LoaderCircle, Save } from 'lucide-react';
import { useForm, type SubmitHandler, useWatch } from 'react-hook-form';

import { Input, Modal, Select, Textarea } from '@ui';
import { TEMPLATE_CATEGORIES } from '@/config/template-categories';
import useContextStore from '@/hooks/useContextStore';
import { type Template, type TemplateSaveMode, useTemplates } from '@/hooks/useTemplates';
import { isAdminRole } from '@/lib/role-utils';
import type { DocumentField } from '@/types/types';

interface SaveAsTemplateModalProps {
  documentId: string | null;
  documentName: string;
  documentFileUrl: string;
  documentFields?: DocumentField[];
  documentFieldCount?: number;
  getDocumentFields?: () => DocumentField[];
  documentPageCount?: number;
  documentFileSize?: number;
  defaultSigners?: Array<{
    id: string;
    name: string;
    email: string;
    role: 'signer' | 'approver' | 'viewer';
    order: number;
  }>;
  onClose: () => void;
  onSuccess?: () => void;
}

interface FormInputs {
  name: string;
  description: string;
  category: string;
  tags: string;
}

type TemplateScopeFilter = 'all' | 'private' | 'workspace';

type SaveSnapshot = {
  replaceCandidates: Template[];
  saveMode: TemplateSaveMode;
  selectedExistingTemplateId: string;
};

function defaultTemplateValues(documentName: string): FormInputs {
  return {
    name: `${documentName} Template`,
    description: '',
    category: 'Other',
    tags: '',
  };
}

function templateValues(template: Template): FormInputs {
  return {
    name: template.name,
    description: template.description || '',
    category: template.category,
    tags: template.tags?.join(', ') || '',
  };
}

function normalizeSearchValue(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function formatTemplateTimestamp(value?: string | Date): string {
  if (!value) return 'recently';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'recently' : date.toLocaleDateString();
}

function templateTimestamp(value?: string | Date): number {
  if (!value) return 0;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function templateScopeLabel(template: Template): string {
  return template.sharingScope === 'workspace' ? 'Workspace' : 'Private';
}

function templateSearchText(template: Template): string {
  return [
    template.name,
    template.description,
    template.category,
    templateScopeLabel(template),
    template.tags?.join(' '),
    formatTemplateTimestamp(template.updatedAt || template.createdAt),
  ]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase();
}

export default function SaveAsTemplateModal({
  documentId,
  documentName,
  documentFileUrl,
  documentFields = [],
  documentFieldCount,
  getDocumentFields,
  documentPageCount = 1,
  documentFileSize = 0,
  defaultSigners = [],
  onClose,
  onSuccess,
}: SaveAsTemplateModalProps) {
  const { createTemplate, fetchTemplates, loading: templatesLoading, templates } = useTemplates();
  const { user } = useContextStore();
  const initialValues = useMemo(() => defaultTemplateValues(documentName), [documentName]);
  const [saveMode, setSaveMode] = useState<TemplateSaveMode>('create');
  const [existingTemplateId, setExistingTemplateId] = useState('');
  const [createDraft, setCreateDraft] = useState<FormInputs>(initialValues);
  const [templateSearch, setTemplateSearch] = useState('');
  const [scopeFilter, setScopeFilter] = useState<TemplateScopeFilter>('all');
  const [showMetadataEditor, setShowMetadataEditor] = useState(false);
  const [sharedReplacementAcknowledged, setSharedReplacementAcknowledged] = useState(false);
  const [saveSnapshot, setSaveSnapshot] = useState<SaveSnapshot | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    control,
    getValues,
    reset,
  } = useForm<FormInputs>({ defaultValues: initialValues });

  const enteredName = useWatch({ control, name: 'name' }) || '';
  const canManageWorkspaceTemplates = isAdminRole(user?.orgRole || user?.role);
  const replaceCandidates = useMemo(
    () => templates
      .filter((template) =>
        !template.isSystemTemplate &&
        template.isActive !== false &&
        !template.deletedAt &&
        (template.userId === user?.id ||
          (template.sharingScope === 'workspace' && canManageWorkspaceTemplates))
      )
      .sort((left, right) => {
        const timestampDifference = templateTimestamp(right.updatedAt || right.createdAt)
          - templateTimestamp(left.updatedAt || left.createdAt);
        return timestampDifference || left.name.localeCompare(right.name);
      }),
    [canManageWorkspaceTemplates, templates, user?.id]
  );

  useEffect(() => {
    void fetchTemplates();
  }, [fetchTemplates]);

  const activeReplaceCandidates = isSubmitting && saveSnapshot
    ? saveSnapshot.replaceCandidates
    : replaceCandidates;
  const effectiveSaveMode = isSubmitting && saveSnapshot ? saveSnapshot.saveMode : saveMode;
  const selectedExistingTemplateId = isSubmitting && saveSnapshot
    ? saveSnapshot.selectedExistingTemplateId
    : existingTemplateId;
  const selectedTemplate = activeReplaceCandidates.find(
    (template) => template._id === selectedExistingTemplateId
  ) ?? null;
  const normalizedTemplateSearch = normalizeSearchValue(templateSearch);
  const visibleReplaceCandidates = activeReplaceCandidates.filter((template) =>
    (scopeFilter === 'all' || template.sharingScope === scopeFilter) &&
    (!normalizedTemplateSearch || templateSearchText(template).includes(normalizedTemplateSearch))
  );
  const sameNameCount = replaceCandidates.filter(
    (template) => normalizeSearchValue(template.name) === normalizeSearchValue(enteredName)
  ).length;
  const visibleFieldCount = documentFieldCount ?? documentFields.length;
  const requiresSharedReplacementAcknowledgement = selectedTemplate?.sharingScope === 'workspace';
  const canConfirmSave = !isSubmitting && (
    effectiveSaveMode === 'create' || (
      Boolean(selectedTemplate) &&
      (!requiresSharedReplacementAcknowledgement || sharedReplacementAcknowledged)
    )
  );

  const chooseSaveMode = (nextMode: TemplateSaveMode) => {
    if (isSubmitting || nextMode === saveMode) return;

    if (nextMode === 'update') {
      setCreateDraft(getValues());
      setSaveMode('update');
      setExistingTemplateId('');
      setTemplateSearch('');
      setScopeFilter('all');
      setShowMetadataEditor(false);
      setSharedReplacementAcknowledged(false);
      return;
    }

    setSaveMode('create');
    setExistingTemplateId('');
    setShowMetadataEditor(false);
    setSharedReplacementAcknowledged(false);
    reset(createDraft);
  };

  const chooseTemplateToReplace = (template: Template) => {
    if (isSubmitting) return;
    setExistingTemplateId(template._id);
    setShowMetadataEditor(false);
    setSharedReplacementAcknowledged(false);
    reset(templateValues(template));
  };

  const onSubmit: SubmitHandler<FormInputs> = async (data) => {
    if (!documentFileUrl) {
      toast.error('Document file URL is missing. Cannot save this template.');
      return;
    }
    if (!documentId) {
      toast.error('Save the document before creating a template.');
      return;
    }
    if (effectiveSaveMode === 'update' && !selectedTemplate) {
      toast.error('Choose a saved template to replace.');
      return;
    }

    setSaveSnapshot({
      replaceCandidates,
      saveMode: effectiveSaveMode,
      selectedExistingTemplateId,
    });
    let keepSnapshotForClose = false;

    try {
      const tags = data.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean);
      const fieldsToPersist = getDocumentFields ? getDocumentFields() : documentFields;
      const result = await createTemplate({
        templateFileUrl: documentFileUrl,
        fields: fieldsToPersist,
        defaultSigners,
        pageCount: documentPageCount,
        fileSize: documentFileSize,
        documentId,
        saveMode: effectiveSaveMode,
        ...(effectiveSaveMode === 'create'
          ? {
              name: data.name,
              description: data.description,
              category: data.category,
              tags,
            }
          : {
              existingTemplateId: selectedExistingTemplateId,
              replaceConfirmation: true,
              ...(showMetadataEditor
                ? {
                    metadata: {
                      name: data.name,
                      description: data.description,
                      category: data.category,
                      tags,
                    },
                  }
                : {}),
            }),
      });

      if (result) {
        toast.success(effectiveSaveMode === 'update' ? 'Template replaced successfully' : 'Template created successfully');
        // The hook upserts the result, so close before the refreshed library
        // can alter the selected target beneath the user.
        keepSnapshotForClose = true;
        onClose();
        onSuccess?.();
      } else {
        toast.error('Unable to save this template.');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred.';
      toast.error(errorMessage);
      console.error('Error saving template:', error);
    } finally {
      if (!keepSnapshotForClose) {
        setSaveSnapshot(null);
      }
    }
  };

  return (
    <Modal
      visible={true}
      title="Save as Template"
      description="Create a reusable template or deliberately replace the content of one you manage."
      onClose={onClose}
      closeOnBackdrop={!isSubmitting}
      showCloseButton={!isSubmitting}
      contentClassName="max-w-2xl"
      handleConfirm={handleSubmit(onSubmit)}
      confirmLabel={
        isSubmitting
          ? 'Saving…'
          : effectiveSaveMode === 'update'
            ? selectedTemplate?.sharingScope === 'workspace'
              ? 'Replace shared template'
              : 'Replace template'
            : 'Create template'
      }
      confirmDisabled={!canConfirmSave}
      confirmIcon={isSubmitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
    >
      <form className="space-y-5">
        <section aria-label="Current document" className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Current document</p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-700">
            <span className="font-medium text-slate-900">{documentName}</span>
            <span>{documentPageCount} {documentPageCount === 1 ? 'page' : 'pages'}</span>
            <span>{visibleFieldCount} {visibleFieldCount === 1 ? 'field' : 'fields'}</span>
          </div>
        </section>

        <fieldset disabled={isSubmitting}>
          <legend className="text-sm font-semibold text-slate-900">How would you like to save?</legend>
          <p className="mt-1 text-sm text-slate-600">
            Creating is safe by default. Replacing changes one existing template for future use.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label
              className={`flex min-h-24 cursor-pointer gap-3 rounded-lg border p-4 transition ${
                effectiveSaveMode === 'create'
                  ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-200'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <input
                type="radio"
                name="template-save-mode"
                checked={effectiveSaveMode === 'create'}
                onChange={() => chooseSaveMode('create')}
                className="mt-1"
              />
              <span>
                <span className="block text-sm font-semibold text-slate-900">Create a new template</span>
                <span className="mt-1 block text-xs leading-5 text-slate-600">
                  Add a separate reusable copy. Existing templates stay unchanged.
                </span>
              </span>
            </label>
            <label
              className={`flex min-h-24 cursor-pointer gap-3 rounded-lg border p-4 transition ${
                effectiveSaveMode === 'update'
                  ? 'border-amber-500 bg-amber-50 ring-1 ring-amber-200'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <input
                type="radio"
                name="template-save-mode"
                checked={effectiveSaveMode === 'update'}
                onChange={() => chooseSaveMode('update')}
                className="mt-1"
              />
              <span>
                <span className="block text-sm font-semibold text-slate-900">Replace an existing template</span>
                <span className="mt-1 block text-xs leading-5 text-slate-600">
                  Replace one template&apos;s PDF, fields, and default recipient roles.
                </span>
              </span>
            </label>
          </div>
        </fieldset>

        {effectiveSaveMode === 'create' && sameNameCount > 0 && (
          <p role="status" className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-950">
            {sameNameCount} {sameNameCount === 1 ? 'template already uses' : 'templates already use'} this name. Creating a new template keeps them unchanged.
          </p>
        )}

        {effectiveSaveMode === 'update' && (
          <section aria-labelledby="replace-template-heading" className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 id="replace-template-heading" className="text-sm font-semibold text-slate-900">Choose a template to replace</h2>
                <p className="mt-1 text-xs leading-5 text-slate-600">
                  Only active templates you have permission to update are shown.
                </p>
              </div>
              <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-slate-600" aria-live="polite">
                {templatesLoading && !isSubmitting
                  ? 'Loading templates…'
                  : `${visibleReplaceCandidates.length} ${visibleReplaceCandidates.length === 1 ? 'result' : 'results'}`}
              </span>
            </div>

            <Input
              type="search"
              value={templateSearch}
              onChange={(event) => setTemplateSearch(event.target.value)}
              disabled={isSubmitting}
              aria-label="Search templates to replace"
              placeholder="Search by name, description, category, or tag"
              className="mt-4 w-full border-amber-300 bg-white focus:ring-2 focus:ring-brand-500"
            />

            <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Filter templates by visibility">
              {([
                ['all', 'All templates'],
                ['private', 'Private'],
                ['workspace', 'Workspace'],
              ] as const).map(([scope, label]) => (
                <button
                  key={scope}
                  type="button"
                  disabled={isSubmitting}
                  aria-pressed={scopeFilter === scope}
                  onClick={() => setScopeFilter(scope)}
                  className={`min-h-9 rounded-full border px-3 text-xs font-medium transition ${
                    scopeFilter === scope
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1" role="listbox" aria-label="Templates available to replace">
              {templatesLoading && !isSubmitting ? (
                <p className="rounded-lg border border-dashed border-amber-300 bg-white px-3 py-4 text-sm text-slate-600">
                  Loading your saved templates…
                </p>
              ) : visibleReplaceCandidates.length > 0 ? (
                visibleReplaceCandidates.map((template) => {
                  const isSelected = selectedExistingTemplateId === template._id;
                  return (
                    <button
                      key={template._id}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      disabled={isSubmitting}
                      onClick={() => chooseTemplateToReplace(template)}
                      className={`flex min-h-16 w-full items-start gap-3 rounded-lg border p-3 text-left transition ${
                        isSelected
                          ? 'border-amber-500 bg-amber-100/70 ring-1 ring-amber-300'
                          : 'border-slate-200 bg-white hover:border-amber-300 hover:bg-amber-50'
                      } disabled:cursor-not-allowed`}
                    >
                      <span
                        aria-hidden="true"
                        className={`mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                          isSelected ? 'border-amber-700 bg-amber-600' : 'border-slate-400 bg-white'
                        }`}
                      >
                        {isSelected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-slate-900">{template.name}</span>
                        {template.description && (
                          <span className="mt-0.5 block line-clamp-1 text-xs text-slate-600">{template.description}</span>
                        )}
                        <span className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-slate-500">
                          <span>{template.category}</span>
                          <span>{templateScopeLabel(template)}</span>
                          <span>Updated {formatTemplateTimestamp(template.updatedAt || template.createdAt)}</span>
                          <span>{template.pageCount || 1} {template.pageCount === 1 ? 'page' : 'pages'}</span>
                          <span>{template.fields?.length || 0} {template.fields?.length === 1 ? 'field' : 'fields'}</span>
                        </span>
                      </span>
                      {isSelected && <span className="shrink-0 text-xs font-semibold text-amber-800">Selected</span>}
                    </button>
                  );
                })
              ) : (
                <p className="rounded-lg border border-dashed border-amber-300 bg-white px-3 py-4 text-sm text-slate-600">
                  {activeReplaceCandidates.length === 0
                    ? 'You do not have any saved templates you can replace yet.'
                    : 'No templates match this search or visibility filter.'}
                </p>
              )}
            </div>

            {selectedTemplate ? (
              <div role="alert" className="mt-4 rounded-lg border border-amber-300 bg-white p-3 text-sm text-slate-800">
                <p className="font-semibold">Replace “{selectedTemplate.name}”</p>
                <p className="mt-1 text-xs leading-5 text-slate-600">
                  This replaces its PDF, signing fields, default recipient roles, and editable content with the current document. Documents already created from this template will not change.
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-600">
                  Its name, description, category, tags, owner, and visibility stay unchanged unless you edit the details below.
                </p>
                {selectedTemplate.sharingScope === 'workspace' && (
                  <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-md bg-amber-100 px-2 py-2 text-xs font-medium text-amber-950">
                    <input
                      type="checkbox"
                      checked={sharedReplacementAcknowledged}
                      disabled={isSubmitting}
                      onChange={(event) => setSharedReplacementAcknowledged(event.target.checked)}
                      className="mt-0.5"
                    />
                    I understand this updates the shared template for future workspace use.
                  </label>
                )}
              </div>
            ) : (
              <p role="status" className="mt-3 text-xs text-slate-600">Select one template to enable replacement.</p>
            )}
          </section>
        )}

        {(effectiveSaveMode === 'create' || (effectiveSaveMode === 'update' && selectedTemplate && showMetadataEditor)) && (
          <section aria-labelledby="template-details-heading" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 id="template-details-heading" className="text-sm font-semibold text-slate-900">Template details</h2>
                {effectiveSaveMode === 'update' && (
                  <p className="mt-1 text-xs text-slate-600">Changes here update the selected template&apos;s details.</p>
                )}
              </div>
              {effectiveSaveMode === 'update' && (
                <button
                  type="button"
                  onClick={() => {
                    if (selectedTemplate) reset(templateValues(selectedTemplate));
                    setShowMetadataEditor(false);
                  }}
                  disabled={isSubmitting}
                  className="text-xs font-semibold text-slate-700 underline underline-offset-2 hover:text-slate-950 disabled:cursor-not-allowed"
                >
                  Keep existing details
                </button>
              )}
            </div>

            <div>
              <label htmlFor="save-as-template-name" className="mb-1 block text-sm font-medium text-slate-700">
                Template name <span className="text-red-500">*</span>
              </label>
              <Input
                id="save-as-template-name"
                {...register('name', {
                  required: 'Template name is required',
                  validate: (value) => value.trim().length > 0 || 'Template name is required',
                })}
                disabled={isSubmitting}
                placeholder="e.g., NDA Agreement"
                className={`w-full border ${errors.name ? 'border-red-500' : 'border-slate-300'} focus:ring-2 focus:ring-brand-500`}
              />
              {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
            </div>

            <Textarea
              {...register('description')}
              disabled={isSubmitting}
              label="Description (optional)"
              placeholder="Describe what this template is used for…"
              rows={3}
              className="resize-none border-slate-300 focus:ring-2 focus:ring-brand-500"
            />

            <div>
              <label htmlFor="save-as-template-category" className="mb-1 block text-sm font-medium text-slate-700">
                Category <span className="text-red-500">*</span>
              </label>
              <Select
                id="save-as-template-category"
                {...register('category')}
                disabled={isSubmitting}
                className="w-full border border-slate-300 focus:ring-2 focus:ring-brand-500"
              >
                {TEMPLATE_CATEGORIES.map((category) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </Select>
            </div>

            <div>
              <label htmlFor="save-as-template-tags" className="mb-1 block text-sm font-medium text-slate-700">Tags (optional)</label>
              <Input
                id="save-as-template-tags"
                type="text"
                {...register('tags')}
                disabled={isSubmitting}
                placeholder="Comma-separated tags, e.g. legal, contract"
                className="w-full border border-slate-300 focus:ring-2 focus:ring-brand-500"
              />
              <p className="mt-1 text-xs text-slate-500">Tags make templates easier to find in the library.</p>
            </div>
          </section>
        )}

        {effectiveSaveMode === 'update' && selectedTemplate && !showMetadataEditor && (
          <button
            type="button"
            onClick={() => setShowMetadataEditor(true)}
            disabled={isSubmitting}
            className="text-sm font-semibold text-slate-700 underline underline-offset-2 hover:text-slate-950 disabled:cursor-not-allowed"
          >
            Edit template details
          </button>
        )}
      </form>
    </Modal>
  );
}
