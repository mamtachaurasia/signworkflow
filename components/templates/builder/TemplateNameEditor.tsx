'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Pencil, X } from 'lucide-react';
import toast from 'react-hot-toast';

import { getCsrfHeaders } from '@/utils/cookies';

interface TemplateNameEditorProps {
  templateId: string;
  name: string;
  editable: boolean;
  onRenamed: (name: string) => void;
}

export default function TemplateNameEditor({
  templateId,
  name,
  editable,
  onRenamed,
}: TemplateNameEditorProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(name);
  }, [editing, name]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const cancel = () => {
    setDraft(name);
    setEditing(false);
  };

  const save = async () => {
    if (saving) return;
    const nextName = draft.trim();
    if (!nextName) {
      toast.error('Template name is required.');
      inputRef.current?.focus();
      return;
    }
    if (nextName.length > 200) {
      toast.error('Template name must be 200 characters or fewer.');
      inputRef.current?.focus();
      return;
    }
    if (nextName === name) {
      setEditing(false);
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`/api/templates/${encodeURIComponent(templateId)}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...getCsrfHeaders() },
        body: JSON.stringify({ name: nextName }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.message || 'Unable to rename template');

      const savedName = typeof body?.template?.name === 'string' && body.template.name.trim()
        ? body.template.name
        : nextName;
      onRenamed(savedName);
      setDraft(savedName);
      setEditing(false);
      toast.success('Template renamed');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to rename template');
      inputRef.current?.focus();
    } finally {
      setSaving(false);
    }
  };

  if (!editable) {
    return <h1 className="truncate text-sm font-semibold text-slate-950 sm:text-base">{name}</h1>;
  }

  if (editing) {
    return (
      <div className="flex min-w-0 max-w-xl flex-1 items-center gap-1.5">
        <input
          ref={inputRef}
          aria-label="Template name"
          value={draft}
          maxLength={200}
          disabled={saving}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void save();
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              cancel();
            }
          }}
          className="h-8 min-w-40 flex-1 rounded-md border border-brand-400 bg-white px-2 text-sm font-semibold text-slate-950 outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        />
        <button
          type="button"
          aria-label="Save template name"
          title="Save template name"
          disabled={saving}
          onClick={() => void save()}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
        >
          <Check className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          aria-label="Cancel rename"
          title="Cancel rename"
          disabled={saving}
          onClick={cancel}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 disabled:opacity-50"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-1">
      <h1 className="truncate text-sm font-semibold text-slate-950 sm:text-base">{name}</h1>
      <button
        type="button"
        aria-label={`Rename template ${name}`}
        title="Rename template"
        onClick={() => setEditing(true)}
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
