'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertCircle, ArrowLeft, Braces, ChevronDown, ChevronUp,
  Columns3, FileSignature, HelpCircle, List, Plus, Rows3,
    Table2, Trash2, Type, X,
} from 'lucide-react';
import toast from 'react-hot-toast';

import { Button, Input, Select } from '@ui';
import RichTextSectionEditor from '@/components/templates/RichTextSectionEditor';
import { hasMeaningfulTemplateContent, normalizeVariableKey } from '@/lib/template-content';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import { getCsrfHeaders } from '@/utils/cookies';
import {
  TEMPLATE_CONTENT_VERSION,
  type EditableTemplateContent,
  type TemplateContentBlock,
  type TemplateContentBlockType,
  type TemplateVariableDefinition,
} from '@/types/template-content';

type TemplateRole = { id: string; name: string; email: string; role: 'signer' | 'approver' | 'viewer'; order: number };

interface SharedContentEditorProps {
  embedded?: boolean;
  toolbarLeading?: ReactNode;
  onSaved?: () => Promise<void> | void;
  onContinueToFields?: () => void;
  backHref?: string;
}

type TemplateContentEditorProps = SharedContentEditorProps & (
  | { mode?: 'template'; templateId: string; documentId?: never }
  | { mode: 'document'; documentId: string; templateId?: never }
);

const emptyContent = (isDocumentMode = false): EditableTemplateContent => ({
  version: TEMPLATE_CONTENT_VERSION,
  blocks: [isDocumentMode
    ? { id: crypto.randomUUID(), type: 'paragraph', text: '', html: '', align: 'left' }
    : { id: crypto.randomUUID(), type: 'title', text: 'Untitled Agreement', html: 'Untitled Agreement', align: 'center' }],
  variables: [],
});

const serializeEditorState = (name: string, content: EditableTemplateContent, roles: TemplateRole[]) =>
  JSON.stringify({ name, content, roles });

export default function TemplateContentEditor(props: TemplateContentEditorProps) {
  const {
    embedded = false,
    toolbarLeading,
    onSaved,
    onContinueToFields,
    backHref = '/dashboard',
  } = props;
  const router = useRouter();
  const isDocumentMode = props.mode === 'document';
  const resourceId = isDocumentMode ? props.documentId : props.templateId;
  const resourceEndpoint = isDocumentMode
    ? `/api/documents/${encodeURIComponent(resourceId)}/content`
    : `/api/templates/${encodeURIComponent(resourceId)}/content`;
  const [resourceName, setResourceName] = useState(isDocumentMode ? 'Untitled document' : 'Template');
  const [content, setContent] = useState<EditableTemplateContent>(() => emptyContent(isDocumentMode));
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [selectedTableCell, setSelectedTableCell] = useState<{ blockId: string; row: number; column: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [variableLabel, setVariableLabel] = useState('');
  const [roles, setRoles] = useState<TemplateRole[]>([]);
  const variableInserters = useRef(new Map<string, (value: string) => void>());
  const savedSnapshotRef = useRef<string | null>(null);
  const currentVersionRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    fetch(resourceEndpoint, { credentials: 'include' })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(body?.message || `Unable to load this ${isDocumentMode ? 'document' : 'template'}`);
        }
        if (cancelled) return;
        const resource = isDocumentMode ? body.document : body.template;
        const nextName = resource?.name || resource?.documentName || (isDocumentMode ? 'Untitled document' : 'Template');
        const nextRoles = Array.isArray(resource?.defaultSigners) ? resource.defaultSigners : [];
        const nextContent = resource?.editableContent?.blocks?.length
          ? resource.editableContent
          : emptyContent(isDocumentMode);
        setResourceName(nextName);
        setRoles(nextRoles);
        setContent(nextContent);
        currentVersionRef.current = typeof resource?.currentVersion === 'number'
          ? resource.currentVersion
          : null;
        if (isDocumentMode) {
          const firstWritableBlock = nextContent.blocks.find((block: TemplateContentBlock) => block.type !== 'page-break');
          setSelectedBlockId(firstWritableBlock?.id || null);
        }
        savedSnapshotRef.current = serializeEditorState(nextName, nextContent, nextRoles);
      })
      .catch((error) => {
        if (cancelled) return;
        const message = error instanceof Error
          ? error.message
          : `Unable to load this ${isDocumentMode ? 'document' : 'template'}`;
        setLoadError(message);
        toast.error(message);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isDocumentMode, loadAttempt, resourceEndpoint]);

  const editorSnapshot = useMemo(
    () => serializeEditorState(resourceName, content, roles),
    [content, resourceName, roles]
  );
  const hasUnsavedChanges = savedSnapshotRef.current !== null && savedSnapshotRef.current !== editorSnapshot;
  useUnsavedChangesGuard(hasUnsavedChanges);

  const selectedBlock = useMemo(() => content.blocks.find((block) => block.id === selectedBlockId) || null, [content.blocks, selectedBlockId]);
  const documentText = useMemo(() => {
    let text = '';
    for (const block of content.blocks) {
      if (text.length >= 24_000) break;
      const blockText = block.type === 'table'
        ? (block.table?.rows || []).flat().join(' ')
        : block.text || (block.html || '').replace(/<[^>]*>/g, ' ');
      if (blockText) text += `${text ? '\n' : ''}${blockText}`;
    }
    return text.slice(0, 24_000);
  }, [content.blocks]);
  const hasDocumentContent = useMemo(
    () => hasMeaningfulTemplateContent(content),
    [content]
  );
  const updateBlock = useCallback((id: string, patch: Partial<TemplateContentBlock>) => {
    setSaveError(null);
    setContent((current) => ({ ...current, blocks: current.blocks.map((block) => block.id === id ? { ...block, ...patch } : block) }));
  }, []);

  const addAiSmartVariables = useCallback((variables: TemplateVariableDefinition[]) => {
    setContent((current) => {
      const existingKeys = new Set(current.variables.map((variable) => variable.key));
      const additions = variables.filter((variable) => !existingKeys.has(variable.key));
      if (additions.length === 0) return current;
      return { ...current, variables: [...current.variables, ...additions] };
    });
  }, []);

  const addBlock = (type: TemplateContentBlockType = 'paragraph', afterId?: string) => {
    const block: TemplateContentBlock = type === 'table'
      ? { id: crypto.randomUUID(), type, text: '', table: { rows: [['Column 1', 'Column 2'], ['', '']] }, align: 'left' }
      : { id: crypto.randomUUID(), type, text: '', html: '', align: 'left' };
    setContent((current) => {
      const found = afterId ? current.blocks.findIndex((item) => item.id === afterId) : current.blocks.length - 1;
      const blocks = [...current.blocks];
      blocks.splice(Math.max(0, found + 1), 0, block);
      return { ...current, blocks };
    });
    setSelectedBlockId(block.id);
    setSelectedTableCell(type === 'table' ? { blockId: block.id, row: 0, column: 0 } : null);
  };

  const moveBlock = (id: string, direction: -1 | 1) => setContent((current) => {
    const index = current.blocks.findIndex((block) => block.id === id);
    const next = index + direction;
    if (index < 0 || next < 0 || next >= current.blocks.length) return current;
    const blocks = [...current.blocks];
    [blocks[index], blocks[next]] = [blocks[next], blocks[index]];
    return { ...current, blocks };
  });

  const removeBlock = (id: string) => {
    setContent((current) => ({ ...current, blocks: current.blocks.filter((block) => block.id !== id) }));
    setSelectedBlockId(null);
    setSelectedTableCell(null);
  };

  const addVariable = () => {
    const key = normalizeVariableKey(variableLabel);
    if (!key) return toast.error('Enter a variable name first');
    if (!/^[a-z]/.test(key)) return toast.error('Variable names must begin with a letter');
    if (content.variables.some((variable) => variable.key === key)) return toast.error('That variable already exists');
    setContent((current) => ({ ...current, variables: [...current.variables, { key, label: variableLabel.trim(), defaultValue: '', required: true }] }));
    setVariableLabel('');
    toast.success('Variable created. Click Insert to place it in the document.');
  };

  const updateVariable = (key: string, patch: Partial<TemplateVariableDefinition>) => setContent((current) => ({
    ...current,
    variables: current.variables.map((variable) => variable.key === key ? { ...variable, ...patch } : variable),
  }));

  const removeVariable = (key: string) => {
    const placeholder = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'gi');
    const removePlaceholder = (value: string) => value.replace(placeholder, '');
    setContent((current) => ({
      ...current,
      blocks: current.blocks.map((block) => ({
        ...block,
        text: removePlaceholder(block.text),
        html: block.html ? removePlaceholder(block.html) : block.html,
        table: block.table
          ? { rows: block.table.rows.map((row) => row.map(removePlaceholder)) }
          : block.table,
      })),
      variables: current.variables.filter((variable) => variable.key !== key),
    }));
  };

  const insertVariable = (key: string) => {
    if (!selectedBlock || selectedBlock.type === 'page-break' || selectedBlock.type === 'table') return toast.error('Click inside a text section where the variable should appear');
    const insert = variableInserters.current.get(selectedBlock.id);
    if (!insert) return toast.error('Click inside the selected text section first');
    insert(`{{${key}}}`);
    toast.success('Variable inserted at the cursor');
  };

  const updateTableCell = (block: TemplateContentBlock, rowIndex: number, columnIndex: number, value: string) => {
    const rows = (block.table?.rows || []).map((row) => [...row]);
    rows[rowIndex][columnIndex] = value;
    updateBlock(block.id, { table: { rows } });
  };
  const addTableRow = (block: TemplateContentBlock) => updateBlock(block.id, { table: { rows: [...(block.table?.rows || []), Array(block.table?.rows[0]?.length || 2).fill('')] } });
  const addTableColumn = (block: TemplateContentBlock) => updateBlock(block.id, { table: { rows: (block.table?.rows || []).map((row, index) => [...row, index === 0 ? `Column ${row.length + 1}` : '']) } });
  const removeSelectedTableRow = (block: TemplateContentBlock) => {
    const rows = block.table?.rows || [];
    if (rows.length <= 1) return toast.error('A table needs at least one row');
    if (!selectedTableCell || selectedTableCell.blockId !== block.id) return toast.error('Select a table cell first');
    const row = selectedTableCell.row;
    updateBlock(block.id, { table: { rows: rows.filter((_, index) => index !== row) } });
    setSelectedTableCell({ ...selectedTableCell, row: Math.min(row, rows.length - 2) });
    toast.success(`Row ${row + 1} removed`);
  };
  const removeSelectedTableColumn = (block: TemplateContentBlock) => {
    const rows = block.table?.rows || [];
    if ((rows[0]?.length || 0) <= 1) return toast.error('A table needs at least one column');
    if (!selectedTableCell || selectedTableCell.blockId !== block.id) return toast.error('Select a table cell first');
    const column = selectedTableCell.column;
    updateBlock(block.id, { table: { rows: rows.map((row) => row.filter((_, index) => index !== column)) } });
    setSelectedTableCell({ ...selectedTableCell, column: Math.min(column, (rows[0]?.length || 1) - 2) });
    toast.success(`Column ${column + 1} removed`);
  };

  const addRole = () => setRoles((current) => [...current, { id: `role_${crypto.randomUUID()}`, name: `Signer ${current.length + 1}`, email: '', role: 'signer', order: current.length + 1 }]);
  const updateRole = (id: string, patch: Partial<TemplateRole>) => setRoles((current) => current.map((role) => role.id === id ? { ...role, ...patch } : role));

  const openFieldsWorkspace = () => {
    if (onContinueToFields) onContinueToFields();
    else if (isDocumentMode) router.push(`/builder/${resourceId}`);
    else router.push(`/builder/template/${resourceId}?workspace=fields`);
  };

  const save = async (nextStep?: 'fields' | 'use') => {
    setSaving(true);
    setSaveError(null);
    try {
      const response = await fetch(resourceEndpoint, {
        method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json', ...getCsrfHeaders() },
        body: JSON.stringify({
          ...(embedded ? {} : { name: resourceName }),
          editableContent: content,
          ...(isDocumentMode
            ? { baseVersion: currentVersionRef.current }
            : { defaultSigners: roles }),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (response.status === 409 && isDocumentMode) {
        const message = 'This draft changed in another tab. Reload it before saving again.';
        setSaveError(message);
        toast.error(message);
        return;
      }
      if (!response.ok) {
        throw new Error(body?.message || `Unable to save this ${isDocumentMode ? 'document' : 'template'}`);
      }
      savedSnapshotRef.current = editorSnapshot;
      const savedResource = isDocumentMode ? body?.document : body?.template;
      const nextVersion = savedResource?.currentVersion ?? body?.preparedVersion?.version ?? body?.currentVersion;
      if (isDocumentMode && typeof nextVersion === 'number') {
        currentVersionRef.current = nextVersion;
      }
      const fieldsNeedReview = isDocumentMode
        ? Boolean(savedResource?.fieldsNeedReview)
        : savedResource?.fieldLayoutStatus === 'needs_review';
      if (fieldsNeedReview) {
        toast.success('Content applied. Review field placement against the updated layout.');
      } else {
        toast.success(isDocumentMode ? 'Draft saved' : nextStep ? 'Content applied' : 'Template content saved');
      }
      await onSaved?.();
      if (nextStep === 'fields') {
        openFieldsWorkspace();
      }
      if (nextStep === 'use' && !isDocumentMode) {
        router.push(`/templates?view=my&use=${encodeURIComponent(resourceId)}`);
      }
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : `Unable to save this ${isDocumentMode ? 'document' : 'template'}`;
      setSaveError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const continueToFields = () => {
    if (isDocumentMode && !hasDocumentContent) {
      toast.error('Add document content before creating an envelope.');
      return;
    }
    if (isDocumentMode && hasUnsavedChanges) {
      toast.error('Save your draft before creating an envelope.');
      return;
    }
    if (hasUnsavedChanges) void save('fields');
    else openFieldsWorkspace();
  };

  if (loading) return <div role="status" className={`flex items-center justify-center bg-slate-100 text-slate-500 ${embedded ? 'min-h-96' : 'min-h-screen'}`}>Loading {isDocumentMode ? 'document writer' : 'template editor'}…</div>;

  if (loadError) {
    return (
      <div className={`flex items-center justify-center bg-slate-100 p-6 ${embedded ? 'min-h-96' : 'min-h-screen'}`}>
        <div role="alert" className="w-full max-w-md rounded-xl border border-rose-200 bg-white p-6 text-center shadow-sm">
          <AlertCircle className="mx-auto h-8 w-8 text-rose-500" aria-hidden="true" />
          <h1 className="mt-3 text-lg font-semibold text-slate-950">
            {isDocumentMode ? 'Document unavailable' : 'Template unavailable'}
          </h1>
          <p className="mt-2 text-sm text-slate-600">{loadError}</p>
          <div className="mt-5 flex justify-center gap-2">
            <Button asChild variant="outline" size="sm"><Link href={backHref}>Back</Link></Button>
            <Button size="sm" label="Try again" onClick={() => setLoadAttempt((attempt) => attempt + 1)} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col bg-slate-100 ${embedded ? 'min-h-full lg:h-full lg:min-h-0' : 'min-h-screen lg:h-screen lg:min-h-0'}`}>
      {embedded ? (
        <div data-testid="template-content-toolbar" className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2">
          {toolbarLeading}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              label={isDocumentMode
                ? saving ? 'Saving…' : hasUnsavedChanges ? 'Save draft' : 'Saved'
                : saving ? 'Applying…' : hasUnsavedChanges ? 'Apply content changes' : 'Content saved'}
              disabled={saving || !hasUnsavedChanges}
              onClick={() => void save()}
            />
            <Button
              size="sm"
              label={isDocumentMode
                ? saving ? 'Creating…' : 'Create Envelope'
                : saving ? 'Applying…' : hasUnsavedChanges ? 'Apply and review fields' : 'Continue to roles & fields'}
              title={isDocumentMode
                ? hasDocumentContent
                  ? hasUnsavedChanges
                    ? 'Save your draft before creating an envelope.'
                    : 'Add recipients and signing fields.'
                  : 'Add document content before creating an envelope.'
                : undefined}
              disabled={saving || (isDocumentMode && (!hasDocumentContent || hasUnsavedChanges))}
              onClick={continueToFields}
            />
          </div>
        </div>
      ) : isDocumentMode ? (
        <header className="border-b border-slate-200 bg-white px-3 py-1">
          <div className="flex flex-wrap items-center gap-3">
            <Button asChild variant="outline" size="icon-sm" aria-label="Back to documents">
              <Link href={backHref}><ArrowLeft className="h-4 w-4" aria-hidden="true" /></Link>
            </Button>
            <div className="min-w-0 flex-1">

              <input
                value={resourceName}
                maxLength={200}
                onChange={(event) => {
                  setSaveError(null);
                  setResourceName(event.target.value);
                }}
                aria-label="Document name"
                className="w-full max-w-xl border-0 bg-transparent p-0 font-semibold text-slate-950 outline-none focus:ring-0"
              />
              <p className="text-xs text-slate-500">Write your document, then add recipients and signing fields.</p>

            </div>
            {/* <div className="flex items-center gap-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-brand-700">Document draft</p>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">Draft</span>
              </div> */}
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
              <span className={`text-xs font-medium ${hasUnsavedChanges ? 'text-amber-700' : 'text-emerald-700'}`} aria-live="polite">
                {saving ? 'Saving…' : hasUnsavedChanges ? 'Unsaved changes' : 'Saved'}
              </span>
              <Button
                variant="outline"
                size="sm"
                label={saving ? 'Saving…' : 'Save draft'}
                disabled={saving || !hasUnsavedChanges}
                onClick={() => void save()}
              />
              <Button
                size="sm"
                label={saving ? 'Creating…' : 'Create Envelope'}
                icon={<FileSignature className="h-4 w-4" />}
                title={hasDocumentContent
                  ? hasUnsavedChanges
                    ? 'Save your draft before creating an envelope.'
                    : 'Add recipients and signing fields.'
                  : 'Add document content before creating an envelope.'}
                disabled={saving || !hasDocumentContent || hasUnsavedChanges}
                onClick={continueToFields}
              />
            </div>
          </div>
          {toolbarLeading && <div className="mt-3 border-t border-slate-100 pt-3">{toolbarLeading}</div>}
          {saveError && <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{saveError}</p>}
        </header>
      ) : <header className="flex min-h-20 flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 py-3 sm:px-5">
        <div className="min-w-0 flex-1 pr-6">
          <div className="flex items-center gap-2"><p className="text-xs font-semibold uppercase tracking-wider text-brand-700">My template</p><p className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">Editable copy</p></div>
          <input value={resourceName} onChange={(event) => setResourceName(event.target.value)} aria-label="Template name" className="mt-1 w-full max-w-xl border-0 bg-transparent p-0 font-semibold text-slate-950 outline-none focus:ring-0" />
          <p className="mt-1 text-xs text-slate-500">Changes save only to your copy. The original system template is never changed.</p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
          <Button variant="outline" size="sm" label="Save template" disabled={saving} onClick={() => void save()} />
          <Button variant="outline" size="sm" label="Setup fields" icon={<FileSignature className="h-4 w-4" />} disabled={saving} onClick={() => void save('fields')} />
          <Button size="sm" label={saving ? 'Saving…' : 'Use this template'} disabled={saving} onClick={() => void save('use')} />
          <Button variant="outlineBrand" size="sm" icon={<X className="h-4 w-4" />} disabled={saving} onClick={() => router.push('/dashboard')} />
        </div>
      </header>}

      <div className="grid flex-1 grid-cols-1 lg:min-h-0 lg:grid-cols-[220px_minmax(0,1fr)_320px] lg:overflow-hidden">
        <aside className="border-b border-slate-200 bg-white p-4 lg:overflow-auto lg:border-b-0 lg:border-r">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Add content</p>
          <p className="mb-3 mt-1 text-xs leading-5 text-slate-500">New content is added after the selected section.</p>
          <div className="space-y-2">
            <button type="button" className="flex w-full items-center gap-2 rounded-md border p-2 text-sm hover:bg-slate-50" onClick={() => addBlock('heading', selectedBlockId || undefined)}><Type className="h-4 w-4" /> Heading</button>
            <button type="button" className="flex w-full items-center gap-2 rounded-md border p-2 text-sm hover:bg-slate-50" onClick={() => addBlock('paragraph', selectedBlockId || undefined)}><Plus className="h-4 w-4" /> Paragraph</button>
            <button type="button" className="flex w-full items-center gap-2 rounded-md border p-2 text-sm hover:bg-slate-50" onClick={() => addBlock('list-item', selectedBlockId || undefined)}><List className="h-4 w-4" /> List item</button>
            <button type="button" className="flex w-full items-center gap-2 rounded-md border p-2 text-sm hover:bg-slate-50" onClick={() => addBlock('table', selectedBlockId || undefined)}><Table2 className="h-4 w-4" /> Table</button>
            <button type="button" className="flex w-full items-center gap-2 rounded-md border p-2 text-sm hover:bg-slate-50" onClick={() => addBlock('page-break', selectedBlockId || undefined)}>— Page break</button>
          </div>
          <div className="mt-6 rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-900">
            <div className="flex items-center gap-2 font-semibold"><HelpCircle className="h-4 w-4" /> How to edit</div>
            {isDocumentMode ? (
              <ol className="mt-2 list-decimal space-y-1 pl-4"><li>Click a section.</li><li>Select words to format them.</li><li>Create a smart variable and insert it where needed.</li><li>Save, then create your envelope to add recipients and signing fields.</li></ol>
            ) : (
              <ol className="mt-2 list-decimal space-y-1 pl-4"><li>Click a section.</li><li>Select words to format them.</li><li>Create a variable, then insert it at your cursor.</li><li>Save or continue to place signing fields.</li></ol>
            )}
          </div>
        </aside>

        <section aria-label={isDocumentMode ? 'Document content canvas' : 'Template content canvas'} className="overflow-x-auto p-3 sm:p-6 lg:overflow-auto lg:p-8">
          <div className="mx-auto min-h-264 min-w-0 max-w-204 bg-white px-3 py-8 shadow-lg sm:px-8 sm:py-10 lg:px-16 lg:py-14">
            {content.blocks.map((block, index) => {
              const selected = selectedBlockId === block.id;
              if (block.type === 'page-break') return (
                <div key={block.id} className={`relative my-8 border-t-2 border-dashed pt-2 text-center text-xs ${selected ? 'border-brand-400 text-brand-700' : 'border-slate-300 text-slate-400'}`} onClick={() => setSelectedBlockId(block.id)}>
                  Page break
                  {selected && <BlockActions index={index} count={content.blocks.length} onUp={() => moveBlock(block.id, -1)} onDown={() => moveBlock(block.id, 1)} onDelete={() => removeBlock(block.id)} />}
                </div>
              );
              return (
                <section key={block.id} data-block-id={block.id} className={`relative mb-3 overflow-hidden rounded-md border transition ${selected ? 'border-brand-400 shadow-sm' : 'border-transparent hover:border-slate-200'}`} onMouseDown={() => setSelectedBlockId(block.id)}>
                  {selected && (
                    <div className="flex min-h-10 items-center justify-between border-b border-brand-100 bg-brand-50 px-2" onMouseDown={(event) => event.preventDefault()}>
                      <div className="flex items-center gap-1">
                        {block.type !== 'table' && <span className="px-2 text-xs font-medium text-slate-500">Format selected text with the toolbar below</span>}
                        {block.type === 'table' && <><button className="flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-white" onMouseDown={(event) => { event.preventDefault(); addTableRow(block); }}><Rows3 className="h-4 w-4" /> Add row</button><button disabled={selectedTableCell?.blockId !== block.id} className="rounded px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:text-slate-400" onMouseDown={(event) => { event.preventDefault(); removeSelectedTableRow(block); }}>{selectedTableCell?.blockId === block.id ? `Delete row ${selectedTableCell.row + 1}` : 'Select row'}</button><button className="flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-white" onMouseDown={(event) => { event.preventDefault(); addTableColumn(block); }}><Columns3 className="h-4 w-4" /> Add column</button><button disabled={selectedTableCell?.blockId !== block.id} className="rounded px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:text-slate-400" onMouseDown={(event) => { event.preventDefault(); removeSelectedTableColumn(block); }}>{selectedTableCell?.blockId === block.id ? `Delete column ${selectedTableCell.column + 1}` : 'Select column'}</button></>}
                      </div>
                      <BlockActions index={index} count={content.blocks.length} onUp={() => moveBlock(block.id, -1)} onDown={() => moveBlock(block.id, 1)} onDelete={() => removeBlock(block.id)} />
                    </div>
                  )}
                  {block.type === 'table' ? (
                    <div className="overflow-x-auto p-3"><p className="mb-2 text-xs text-slate-500">Select a cell to target its row or column.</p><table className="w-full border-collapse text-sm"><tbody>{(block.table?.rows || []).map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, columnIndex) => { const activeCell = selectedTableCell?.blockId === block.id && selectedTableCell.row === rowIndex && selectedTableCell.column === columnIndex; return <td key={columnIndex} contentEditable suppressContentEditableWarning onFocus={() => { setSelectedBlockId(block.id); setSelectedTableCell({ blockId: block.id, row: rowIndex, column: columnIndex }); }} onClick={() => setSelectedTableCell({ blockId: block.id, row: rowIndex, column: columnIndex })} onBlur={(event) => updateTableCell(block, rowIndex, columnIndex, event.currentTarget.innerText)} className={`min-w-24 border p-2 outline-none ${activeCell ? 'border-brand-500 bg-brand-50 ring-2 ring-inset ring-brand-300' : 'border-slate-300'} ${rowIndex === 0 ? 'font-semibold' : ''}`}>{cell}</td>; })}</tr>)}</tbody></table></div>
                  ) : selected ? (
                    <div style={{ textAlign: block.align || 'left' }}><RichTextSectionEditor
                      templateId={isDocumentMode ? undefined : resourceId}
                      documentId={isDocumentMode ? resourceId : undefined}
                      documentName={resourceName}
                      documentText={documentText}
                      html={block.html ?? block.text}
                      placeholder={block.type === 'title' ? 'Agreement title' : block.type === 'heading' ? 'Clause heading' : 'Write contract text…'}
                      className={`whitespace-pre-wrap [&_a]:text-brand-700 [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:border-slate-300 [&_blockquote]:pl-3 [&_h1]:my-3 [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:my-2 [&_h2]:text-xl [&_h2]:font-bold [&_h3]:my-2 [&_h3]:text-lg [&_h3]:font-semibold [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-1 [&_ul]:list-disc [&_ul]:pl-6 ${block.type === 'title' ? 'text-3xl font-semibold' : block.type === 'heading' ? 'text-lg font-semibold' : 'text-sm leading-6'} ${block.bold ? 'font-bold' : ''} ${block.italic ? 'italic' : ''}`}
                      onChange={(html, text) => updateBlock(block.id, { html, text })}
                      onSmartVariablesDetected={addAiSmartVariables}
                      onReady={(insert) => {
                        if (insert) variableInserters.current.set(block.id, insert);
                        else variableInserters.current.delete(block.id);
                      }}
                    /></div>
                  ) : (
                    <div
                      className={`min-h-8 whitespace-pre-wrap px-3 py-2 [&_a]:text-brand-700 [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:border-slate-300 [&_blockquote]:pl-3 [&_h1]:my-3 [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:my-2 [&_h2]:text-xl [&_h2]:font-bold [&_h3]:my-2 [&_h3]:text-lg [&_h3]:font-semibold [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-1 [&_ul]:list-disc [&_ul]:pl-6 ${block.type === 'title' ? 'text-3xl font-semibold' : block.type === 'heading' ? 'text-lg font-semibold' : 'text-sm leading-6'} ${block.bold ? 'font-bold' : ''} ${block.italic ? 'italic' : ''}`}
                      style={{ textAlign: block.align || 'left' }}
                      dangerouslySetInnerHTML={{ __html: block.html ?? block.text }}
                    />
                  )}
                </section>
              );
            })}
          </div>
        </section>

        <aside className="border-t border-slate-200 bg-white p-4 lg:overflow-auto lg:border-l lg:border-t-0">
          <div className="flex items-center gap-2"><Braces className="h-4 w-4 text-brand-700" /><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Smart variables</p></div>
          <p className="mt-2 text-xs leading-5 text-slate-500">{isDocumentMode ? <>AI can add editable details to a draft, or you can create one yourself. You can fill their values whenever you are ready.</> : <>Variables are reusable placeholders. Create one, click in the document, then select <strong>Insert here</strong>. Its default value appears in the generated agreement.</>}</p>
          <div className="mt-3 flex gap-2"><Input value={variableLabel} onChange={(event) => setVariableLabel(event.target.value)} placeholder="e.g. Company name" /><button onClick={addVariable} className="rounded-md bg-slate-900 px-3 text-white" aria-label="Create variable">+</button></div>
          <div className="mt-4 space-y-3">
            {content.variables.map((variable) => (
              <div key={variable.key} className="rounded-md border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-2"><div><p className="text-sm font-semibold text-slate-900">{variable.label}</p><code className="text-xs text-brand-700">{`{{${variable.key}}}`}</code></div><button className="rounded bg-brand-50 px-2 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-100" onMouseDown={(event) => { event.preventDefault(); insertVariable(variable.key); }}>Insert here</button></div>
                <Input className="mt-2" value={variable.defaultValue || ''} onChange={(event) => updateVariable(variable.key, { defaultValue: event.target.value })} placeholder={isDocumentMode ? 'Value for this envelope' : 'Default/example value'} />
                <button className="mt-2 text-xs text-red-600" onClick={() => removeVariable(variable.key)}>Remove variable</button>
              </div>
            ))}
            {content.variables.length === 0 && <p className="rounded-md border border-dashed p-3 text-xs text-slate-500">No variables yet. Example: create “Company name”, click where it belongs, then click “Insert here”.</p>}
          </div>

          {!embedded && !isDocumentMode && <div className="mt-8 border-t border-slate-200 pt-5">
            <div className="flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Recipient roles</p><button onClick={addRole} className="text-xs font-semibold text-brand-700">+ Add role</button></div>
            <p className="mt-1 text-xs leading-5 text-slate-500">Define who acts on this agreement. Actual names and emails can be supplied before sending.</p>
            <div className="mt-3 space-y-3">
              {roles.map((role) => <div key={role.id} className="rounded-md border border-slate-200 p-3"><Input value={role.name} onChange={(event) => updateRole(role.id, { name: event.target.value })} placeholder="Role name" /><Select className="mt-2 w-full" value={role.role} onChange={(event) => updateRole(role.id, { role: event.target.value as TemplateRole['role'] })}><option value="signer">Signer</option><option value="approver">Approver</option><option value="viewer">Viewer</option></Select><button className="mt-2 text-xs text-red-600" onClick={() => setRoles((current) => current.filter((item) => item.id !== role.id).map((item, roleIndex) => ({ ...item, order: roleIndex + 1 })))}>Remove role</button></div>)}
              {roles.length === 0 && <button onClick={addRole} className="w-full rounded-md border border-dashed border-slate-300 p-3 text-sm text-slate-500">Add the first recipient role</button>}
            </div>
          </div>}
        </aside>
      </div>
    </div>
  );
}

function BlockActions({ index, count, onUp, onDown, onDelete }: { index: number; count: number; onUp: () => void; onDown: () => void; onDelete: () => void }) {
  return <div className="flex items-center gap-1"><button type="button" title="Move section up" disabled={index === 0} className="rounded p-1.5 hover:bg-white disabled:opacity-30" onMouseDown={(event) => { event.preventDefault(); onUp(); }}><ChevronUp className="h-4 w-4" /></button><button type="button" title="Move section down" disabled={index === count - 1} className="rounded p-1.5 hover:bg-white disabled:opacity-30" onMouseDown={(event) => { event.preventDefault(); onDown(); }}><ChevronDown className="h-4 w-4" /></button><button type="button" title="Delete section" className="rounded p-1.5 text-red-600 hover:bg-red-50" onMouseDown={(event) => { event.preventDefault(); onDelete(); }}><Trash2 className="h-4 w-4" /></button></div>;
}
