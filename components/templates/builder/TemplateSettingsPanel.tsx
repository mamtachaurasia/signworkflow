'use client';

import { useEffect, useMemo, useState } from 'react';
import { Save, Settings2 } from 'lucide-react';
import toast from 'react-hot-toast';

import { Button, Input, Select, Textarea } from '@ui';
import { TEMPLATE_CATEGORIES } from '@/config/template-categories';
import { useSubscriptionStatus } from '@/hooks/useSubscriptionStatus';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import { getCsrfHeaders } from '@/utils/cookies';
import type { TemplateBuilderTemplate } from './template-builder-types';

interface TemplateSettingsPanelProps {
  template: TemplateBuilderTemplate;
  onSaved: () => Promise<void> | void;
}

type SettingsDraft = {
  name: string;
  description: string;
  category: string;
  tags: string;
  sharingScope: 'private' | 'workspace';
};

const toDraft = (template: TemplateBuilderTemplate): SettingsDraft => ({
  name: template.name || '',
  description: template.description || '',
  category: template.category || 'Other',
  tags: (template.tags || []).join(', '),
  sharingScope: template.sharingScope === 'workspace' ? 'workspace' : 'private',
});

export default function TemplateSettingsPanel({ template, onSaved }: TemplateSettingsPanelProps) {
  const [draft, setDraft] = useState<SettingsDraft>(() => toDraft(template));
  const [saving, setSaving] = useState(false);
  const { status: subscriptionStatus } = useSubscriptionStatus({ enabled: true });

  useEffect(() => {
    setDraft(toDraft(template));
  }, [template]);

  const initialDraft = useMemo(() => toDraft(template), [template]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(initialDraft);
  useUnsavedChangesGuard(dirty);

  const update = <Key extends keyof SettingsDraft>(key: Key, value: SettingsDraft[Key]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const save = async () => {
    const name = draft.name.trim();
    if (!name) {
      toast.error('Template name is required.');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`/api/templates/${encodeURIComponent(template._id)}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...getCsrfHeaders() },
        body: JSON.stringify({
          name,
          description: draft.description.trim(),
          category: draft.category,
          tags: draft.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
          sharingScope: draft.sharingScope,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(body?.message || 'Unable to update template settings');
      }
      toast.success('Template settings saved');
      await onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to update template settings');
    } finally {
      setSaving(false);
    }
  };

  const canShare = subscriptionStatus.entitlements.templateCollaboration;

  return (
    <div className="mx-auto w-full max-w-3xl p-4 sm:p-8">
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4 sm:px-6">
          <div className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-brand-700" aria-hidden="true" />
            <h2 className="text-lg font-semibold text-slate-950">Template settings</h2>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            These details help people identify and find the template. They do not change the document layout.
          </p>
        </div>

        <div className="space-y-5 p-5 sm:p-6">
          <div>
            <label htmlFor="template-settings-name" className="mb-1 block text-sm font-medium text-slate-800">
              Template name
            </label>
            <Input
              id="template-settings-name"
              value={draft.name}
              onChange={(event) => update('name', event.target.value)}
              maxLength={200}
            />
          </div>

          <Textarea
            label="Description"
            value={draft.description}
            onChange={(event) => update('description', event.target.value)}
            rows={4}
            maxLength={2000}
            placeholder="Explain when this template should be used."
          />

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="template-settings-category" className="mb-1 block text-sm font-medium text-slate-800">
                Category
              </label>
              <Select
                id="template-settings-category"
                value={draft.category}
                onChange={(event) => update('category', event.target.value)}
                className="w-full"
              >
                {TEMPLATE_CATEGORIES.map((category) => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </Select>
            </div>

            <div>
              <label htmlFor="template-settings-tags" className="mb-1 block text-sm font-medium text-slate-800">
                Search tags
              </label>
              <Input
                id="template-settings-tags"
                value={draft.tags}
                onChange={(event) => update('tags', event.target.value)}
                placeholder="legal, onboarding, sales"
              />
            </div>
          </div>

          <fieldset className="rounded-lg border border-slate-200 p-4">
            <legend className="px-1 text-sm font-medium text-slate-800">Visibility</legend>
            <div className="mt-1 grid gap-3 sm:grid-cols-2">
              <label className={`rounded-lg border p-3 ${draft.sharingScope === 'private' ? 'border-brand-500 bg-brand-50' : 'border-slate-200'}`}>
                <span className="flex items-start gap-3">
                  <input
                    type="radio"
                    name="template-sharing-scope"
                    value="private"
                    checked={draft.sharingScope === 'private'}
                    onChange={() => update('sharingScope', 'private')}
                    className="mt-1"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-slate-900">Private</span>
                    <span className="block text-xs leading-5 text-slate-600">Only you can manage this template.</span>
                  </span>
                </span>
              </label>
              <label className={`rounded-lg border p-3 ${draft.sharingScope === 'workspace' ? 'border-brand-500 bg-brand-50' : 'border-slate-200'} ${!canShare ? 'opacity-60' : ''}`}>
                <span className="flex items-start gap-3">
                  <input
                    type="radio"
                    name="template-sharing-scope"
                    value="workspace"
                    checked={draft.sharingScope === 'workspace'}
                    onChange={() => update('sharingScope', 'workspace')}
                    disabled={!canShare}
                    className="mt-1"
                  />
                  <span>
                    <span className="block text-sm font-semibold text-slate-900">Workspace</span>
                    <span className="block text-xs leading-5 text-slate-600">
                      {canShare ? 'People in your workspace can use this template.' : 'Business Plus is required for workspace templates.'}
                    </span>
                  </span>
                </span>
              </label>
            </div>
          </fieldset>

          <div className="flex justify-end border-t border-slate-100 pt-5">
            <Button
              label={saving ? 'Saving…' : dirty ? 'Save settings' : 'Settings saved'}
              icon={<Save className="h-4 w-4" />}
              disabled={saving || !dirty}
              onClick={() => void save()}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
