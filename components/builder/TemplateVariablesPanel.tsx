'use client';

import { useEffect, useMemo, useState } from 'react';
import { Braces, CheckCircle2, LoaderCircle, RotateCcw, Save, Trash2, X } from 'lucide-react';
import toast from 'react-hot-toast';

import type { DocumentField, Recipient } from '@/types/types';
import type { EditableTemplateContent, TemplateVariableDefinition } from '@/types/template-content';
import { getCookieValue } from '@/utils/cookies';

export type TemplateVariableStatus = {
  available: boolean;
  loading: boolean;
  complete: boolean;
  dirty: boolean;
  missingLabels: string[];
  open: boolean;
};

export type TemplateVariableApplyResult = {
  fields: DocumentField[];
  recipients: Recipient[];
  fieldsNeedReview: boolean;
  preparedVersion: number | null;
};

type VariableSource = 'template' | 'document' | null;

type Props = {
  documentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStatusChange: (status: TemplateVariableStatus) => void;
  /**
   * Captures the live Builder layout as part of the explicit Apply action.
   * Without this, a freshly moved field exists only in the browser when the
   * preparation endpoint renders the next PDF version.
   */
  getCurrentFields?: () => DocumentField[];
  onValuesApplied?: (result: TemplateVariableApplyResult) => void;
};

function valuesFromVariables(variables: TemplateVariableDefinition[]): Record<string, string> {
  return Object.fromEntries(
    variables.map((variable) => [variable.key, String(variable.defaultValue || '')])
  );
}

function missingVariableLabels(
  variables: TemplateVariableDefinition[],
  values: Record<string, string>,
  excluded: ReadonlySet<string>
): string[] {
  return variables
    .filter((variable) => !excluded.has(variable.key) && variable.required && !String(values[variable.key] || '').trim())
    .map((variable) => variable.label);
}

export default function TemplateVariablesPanel({
  documentId,
  open,
  onOpenChange,
  onStatusChange,
  getCurrentFields,
  onValuesApplied,
}: Props) {
  const [editableContent, setEditableContent] = useState<EditableTemplateContent | null>(null);
  const [source, setSource] = useState<VariableSource>(null);
  const [contentVersion, setContentVersion] = useState<number | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [savedValues, setSavedValues] = useState<Record<string, string>>({});
  const [excludedKeys, setExcludedKeys] = useState<string[]>([]);
  const [savedExcludedKeys, setSavedExcludedKeys] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const variables = useMemo(() => editableContent?.variables || [], [editableContent]);
  const supportsExclusion = source === 'template';
  const excluded = useMemo(() => new Set(excludedKeys), [excludedKeys]);
  const missingLabels = useMemo(
    () => missingVariableLabels(variables, values, excluded),
    [excluded, values, variables]
  );
  const dirty = useMemo(
    () => variables.some((variable) => !excluded.has(variable.key) && String(values[variable.key] || '') !== String(savedValues[variable.key] || '')) ||
      [...excludedKeys].sort().join('|') !== [...savedExcludedKeys].sort().join('|'),
    [excluded, excludedKeys, savedExcludedKeys, savedValues, values, variables]
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    setSource(null);
    setEditableContent(null);
    setContentVersion(null);
    setValues({});
    setSavedValues({});
    setExcludedKeys([]);
    setSavedExcludedKeys([]);

    const loadVariables = async () => {
      const templateResponse = await fetch(
        `/api/documents/${encodeURIComponent(documentId)}/prepare-template`,
        { credentials: 'include', cache: 'no-store' }
      );
      const templateBody = await templateResponse.json().catch(() => ({}));
      if (templateResponse.ok) {
        const content = templateBody?.template?.editableContent as EditableTemplateContent | undefined;
        if (!content) return null;
        const nextValues = templateBody?.values && typeof templateBody.values === 'object'
          ? templateBody.values as Record<string, string>
          : valuesFromVariables(content.variables || []);
        const nextExcluded = Array.isArray(templateBody?.excludedVariableKeys)
          ? templateBody.excludedVariableKeys.map(String)
          : [];
        return {
          source: 'template' as const,
          content,
          contentVersion: null,
          values: nextValues,
          excludedKeys: nextExcluded,
        };
      }
      if (templateResponse.status !== 404) {
        throw new Error(templateBody?.message || 'Unable to load document variables');
      }

      const contentResponse = await fetch(
        `/api/documents/${encodeURIComponent(documentId)}/content`,
        { credentials: 'include', cache: 'no-store' }
      );
      const contentBody = await contentResponse.json().catch(() => ({}));
      if (contentResponse.status === 404 || contentResponse.status === 409) return null;
      if (!contentResponse.ok) {
        throw new Error(contentBody?.message || 'Unable to load document variables');
      }
      const content = contentBody?.document?.editableContent as EditableTemplateContent | undefined;
      if (!content) return null;
      const version = contentBody?.document?.currentVersion;
      return {
        source: 'document' as const,
        content,
        contentVersion: typeof version === 'number' ? version : null,
        values: valuesFromVariables(content.variables || []),
        excludedKeys: [],
      };
    };

    void loadVariables()
      .then((resource) => {
        if (!active || !resource) return;
        setSource(resource.source);
        setEditableContent(resource.content);
        setContentVersion(resource.contentVersion);
        setValues(resource.values);
        setSavedValues(resource.values);
        setExcludedKeys(resource.excludedKeys);
        setSavedExcludedKeys(resource.excludedKeys);
      })
      .catch((error) => {
        if (active) toast.error(error instanceof Error ? error.message : 'Unable to load document variables');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [documentId]);

  useEffect(() => {
    onStatusChange({
      available: variables.length > 0,
      loading,
      complete: variables.length === 0 || missingLabels.length === 0,
      dirty,
      missingLabels,
      open,
    });
  }, [dirty, loading, missingLabels, onStatusChange, open, variables.length]);

  const applyDocumentValues = async (currentFields: DocumentField[] | undefined) => {
    if (!editableContent || contentVersion === null) {
      throw new Error('Document variables are still loading. Please try again.');
    }

    const nextContent: EditableTemplateContent = {
      ...editableContent,
      variables: editableContent.variables.map((variable) => ({
        ...variable,
        defaultValue: String(values[variable.key] ?? ''),
      })),
    };
    const csrfToken = getCookieValue('csrf_token');
    const response = await fetch(`/api/documents/${encodeURIComponent(documentId)}/content`, {
      method: 'PUT',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
      },
      body: JSON.stringify({
        baseVersion: contentVersion,
        editableContent: nextContent,
        ...(currentFields ? { fields: currentFields } : {}),
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.message || 'Unable to apply document variable values');

    const savedContent = (body?.document?.editableContent as EditableTemplateContent | undefined) || nextContent;
    const nextValues = valuesFromVariables(savedContent.variables || []);
    setEditableContent(savedContent);
    setValues(nextValues);
    setSavedValues(nextValues);
    const nextVersion = body?.document?.currentVersion ?? body?.preparedVersion;
    setContentVersion(typeof nextVersion === 'number' ? nextVersion : contentVersion);
    onValuesApplied?.({
      fields: Array.isArray(body?.fields) ? body.fields as DocumentField[] : (currentFields || []),
      recipients: [],
      fieldsNeedReview: body?.document?.fieldsNeedReview === true,
      preparedVersion: typeof nextVersion === 'number' ? nextVersion : null,
    });

    const nextMissingLabels = missingVariableLabels(savedContent.variables || [], nextValues, new Set());
    if (body?.document?.fieldsNeedReview === true) {
      toast.success('Values applied. Review the signing field placement and save before sending.');
    } else {
      toast.success(nextMissingLabels.length === 0 ? 'All Smart variable values applied' : 'Smart variable values saved');
    }
  };

  const applyTemplateValues = async (currentFields: DocumentField[] | undefined) => {
    const csrfToken = getCookieValue('csrf_token');
    const response = await fetch(`/api/documents/${encodeURIComponent(documentId)}/prepare-template`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
      },
      body: JSON.stringify({
        variableValues: values,
        excludedVariableKeys: excludedKeys,
        ...(currentFields ? { fields: currentFields } : {}),
      }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.message || 'Unable to apply template values');
    setValues(body.values || values);
    setSavedValues(body.values || values);
    setSavedExcludedKeys(body.excludedVariableKeys || excludedKeys);
    onValuesApplied?.({
      fields: Array.isArray(body.fields) ? body.fields as DocumentField[] : (currentFields || []),
      recipients: Array.isArray(body.recipients) ? body.recipients as Recipient[] : [],
      fieldsNeedReview: body.fieldsNeedReview === true,
      preparedVersion: typeof body.preparedVersion === 'number' ? body.preparedVersion : null,
    });
    if (body.requiresFieldReview) {
      toast.success('Values applied. Existing signing fields were preserved; review their placement and save before sending.');
    } else {
      toast.success(excludedKeys.length === variables.length && variables.length > 0 ? 'All variables removed from this agreement' : body.complete ? 'All template values applied' : 'Template values saved');
    }
  };

  const applyValues = async () => {
    setSaving(true);
    try {
      const currentFields = getCurrentFields?.();
      if (source === 'document') {
        await applyDocumentValues(currentFields);
      } else if (source === 'template') {
        await applyTemplateValues(currentFields);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to apply document variables');
    } finally {
      setSaving(false);
    }
  };

  if (!loading && variables.length === 0) return null;

  return <>
    {!open && <button type="button" onClick={() => onOpenChange(true)} className={`fixed right-42 top-20 z-40 flex items-center gap-2 rounded-lg border p-2 text-xs ${missingLabels.length ? 'border-red-300 bg-red-50 text-red-700' : 'border-slate-200 bg-white text-slate-700'}`}><Braces className="h-4 w-4" />{missingLabels.length > 0 && <span className="rounded-full bg-red-600 px-1.5 text-xs text-white">{missingLabels.length}</span>}</button>}
    <aside className={`fixed right-41 top-14 z-40 ${open ? 'flex' : 'hidden'} h-[calc(100vh-56px)] w-64 max-w-[calc(100vw-11rem)] flex-col border-l border-slate-200 bg-white shadow-xl`} aria-label="Template variables">
      <header className="flex items-start justify-between border-b border-slate-200 p-4"><div><p className="flex items-center gap-2 font-semibold text-slate-950"><Braces className="h-4 w-4 text-brand-700" />Document variables</p><p className="mt-1 text-xs text-slate-500">Set required values before sending this envelope.</p></div><button type="button" onClick={() => onOpenChange(false)} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Close variables"><X className="h-5 w-5" /></button></header>
      <div className="flex-1 space-y-3 overflow-y-auto p-4">{loading ? <div className="flex items-center gap-2 text-xs text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" />Loading variables…</div> : <>{variables.filter((variable) => !excluded.has(variable.key)).map((variable) => { const missing = variable.required && !String(values[variable.key] || '').trim(); return <div key={variable.key} className={`rounded-lg border p-3 ${missing ? 'border-red-300 bg-red-50/50' : 'border-slate-200'}`}><div className="flex items-center justify-between gap-2"><label htmlFor={`variable-${variable.key}`} className={`text-xs font-medium ${missing ? 'text-red-700' : 'text-slate-800'}`}>{variable.label}{variable.required && <span className="ml-1 text-red-600">*</span>}</label>{supportsExclusion && <button type="button" onClick={() => setExcludedKeys((current) => [...current, variable.key])} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Remove this variable from the agreement" aria-label={`Remove ${variable.label}`}><Trash2 className="h-3 w-3" /></button>}</div><input id={`variable-${variable.key}`} value={values[variable.key] || ''} onChange={(event) => setValues((current) => ({ ...current, [variable.key]: event.target.value }))} placeholder={`Enter ${variable.label.toLowerCase()}`} aria-invalid={missing} className={`mt-2 w-full rounded-md border px-3 py-2 text-xs outline-none focus:ring-2 ${missing ? 'border-red-400 bg-white focus:border-red-500 focus:ring-red-100' : 'border-slate-300 focus:border-brand-500 focus:ring-brand-100'}`} />{missing && <p className="mt-1 text-xs text-red-600">Required before sending.</p>}</div>; })}{supportsExclusion && excludedKeys.length > 0 && <div className="border-t border-slate-200 pt-4"><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Removed variables</p>{variables.filter((variable) => excluded.has(variable.key)).map((variable) => <div key={variable.key} className="mb-2 flex items-center justify-between rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-500"><span className="line-through">{variable.label}</span><button type="button" onClick={() => setExcludedKeys((current) => current.filter((key) => key !== variable.key))} className="flex items-center gap-1 text-xs font-medium text-brand-700 hover:text-brand-600"><RotateCcw className="h-3.5 w-3.5" />Restore</button></div>)}</div>}</>}</div>
      <footer className="border-t border-slate-200 bg-slate-50 p-4">{missingLabels.length === 0 && !dirty && <p className="mb-3 flex items-center gap-2 text-xs font-medium text-emerald-700"><CheckCircle2 className="h-4 w-4" />{supportsExclusion && excludedKeys.length === variables.length && variables.length > 0 ? 'All variables have been removed from this agreement.' : 'Variables are complete and applied.'}</p>}<button type="button" disabled={saving || !dirty} onClick={() => void applyValues()} className="flex w-full items-center justify-center gap-2 rounded-md bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-40">{saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Apply values</button></footer>
    </aside>
  </>;
}
