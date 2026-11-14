'use client';

import {
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import { FontFamily, FontSize, LineHeight, TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import Image from '@tiptap/extension-image';
import { Table } from '@tiptap/extension-table';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableRow } from '@tiptap/extension-table-row';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import HorizontalRule from '@tiptap/extension-horizontal-rule';
import {
  type LucideIcon,
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  BriefcaseBusiness,
  Check,
  ChevronDown,
  Code2,
  Copy,
  Highlighter,
  Image as ImageIcon,
  Italic,
  Link2,
  List,
  ListOrdered,
  LoaderCircle,
  MessageSquareText,
  Minus,
  Palette,
  PenLine,
  Quote,
  Redo2,
  RefreshCw,
  RemoveFormatting,
  Scissors,
  Sparkles,
  SpellCheck2,
  Strikethrough,
  Table as TableIcon,
  Trash,
  Underline,
  Undo2,
  Unlink2,
  WandSparkles,
  X,
  PanelTop,
  PanelBottom,
  PanelLeft,
  PanelRight,
  Rows2,
  Columns2,
} from 'lucide-react';
import toast from 'react-hot-toast';

import { cn } from '@/lib/utils';
import type { WritingAssistMode } from '@/lib/modules/ai/ai-provider.interface';
import {
  getDocumentWritingPrompts,
  type DocumentWritingPrompt,
} from '@/lib/template-writing-prompts';
import type { TemplateVariableDefinition } from '@/types/template-content';
import { getCookieValue } from '@/utils/cookies';

type InsertContent = ((value: string) => void) | null;

type Props = {
  templateId?: string;
  documentId?: string;
  aiEnabled?: boolean;
  documentName?: string;
  documentText?: string;
  html: string;
  placeholder: string;
  className?: string;
  onChange: (html: string, text: string) => void;
  onSmartVariablesDetected?: (variables: TemplateVariableDefinition[]) => void;
  onReady?: (insert: InsertContent) => void;
};

type OpenPanel = 'link' | 'text-color' | 'highlight' | 'image' | 'ai' | null;

type SelectionSnapshot = {
  from: number;
  to: number;
  selectedText: string;
  sectionText: string;
  documentFingerprint: string;
};

type EditorViewState = {
  block: 'paragraph' | 'heading-1' | 'heading-2' | 'heading-3' | 'blockquote';
  canUndo: boolean;
  canRedo: boolean;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  code: boolean;
  subscript: boolean;
  superscript: boolean;
  bulletList: boolean;
  orderedList: boolean;
  blockquote: boolean;
  link: boolean;
  align: 'left' | 'center' | 'right' | 'justify';
  fontFamily: string;
  fontSize: string;
  lineHeight: string;
  color: string;
  highlightColor: string;
  words: number;
  characters: number;
};

const EMPTY_EDITOR_STATE: EditorViewState = {
  block: 'paragraph',
  canUndo: false,
  canRedo: false,
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  code: false,
  subscript: false,
  superscript: false,
  bulletList: false,
  orderedList: false,
  blockquote: false,
  link: false,
  align: 'left',
  fontFamily: '',
  fontSize: '',
  lineHeight: '',
  color: '',
  highlightColor: '',
  words: 0,
  characters: 0,
};

const FONT_FAMILIES = [
  { value: '', label: 'Default font' },
  { value: 'Arial', label: 'Arial' },
  { value: 'Georgia', label: 'Georgia' },
  { value: 'Times New Roman', label: 'Times New Roman' },
  { value: 'Courier New', label: 'Courier New' },
];

const FONT_SIZES = ['', '10px', '11px', '12px', '14px', '16px', '18px', '20px', '24px', '30px'];
const LINE_HEIGHTS = ['', '1', '1.15', '1.5', '2'];
const TEXT_COLORS = ['#0f172a', '#475569', '#1d4ed8', '#6d28d9', '#be123c', '#b91c1c', '#047857', '#b45309'];
const HIGHLIGHT_COLORS = ['#fef08a', '#fed7aa', '#fecdd3', '#ddd6fe', '#bae6fd', '#bbf7d0', '#e2e8f0'];

const AI_MODES: Array<{
  value: WritingAssistMode;
  label: string;
  description: string;
  icon: LucideIcon;
}> = [
  { value: 'draft', label: 'Draft', description: 'Write new agreement language from your instructions.', icon: PenLine },
  { value: 'rewrite', label: 'Rewrite', description: 'Improve clarity while preserving the original meaning.', icon: RefreshCw },
  { value: 'professional', label: 'Professional', description: 'Use a precise, formal agreement tone.', icon: BriefcaseBusiness },
  { value: 'concise', label: 'Shorten', description: 'Remove repetition without dropping obligations.', icon: Scissors },
  { value: 'plain_language', label: 'Plain language', description: 'Make the text easier to understand.', icon: MessageSquareText },
  { value: 'grammar', label: 'Fix grammar', description: 'Correct grammar and punctuation only.', icon: SpellCheck2 },
];

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function plainTextToTiptapHtml(value: string): string {
  const normalized = value.replace(/\r\n?/g, '\n').trim();
  if (!normalized) return '<p></p>';

  return normalized
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.split('\n').map(escapeHtml).join('<br>')}</p>`)
    .join('');
}

function normalizeLinkUrl(value: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  const candidate = /^[a-z][a-z\d+.-]*:/i.test(raw)
    ? raw
    : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)
      ? `mailto:${raw}`
      : `https://${raw}`;

  try {
    const url = new URL(candidate);
    return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function getWordCount(value: string): number {
  const trimmed = value.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

function isSmartVariableDefinition(value: unknown): value is TemplateVariableDefinition {
  if (!value || typeof value !== 'object') return false;
  const variable = value as Record<string, unknown>;
  return typeof variable.key === 'string' &&
    /^[a-z][a-z0-9_]{0,63}$/.test(variable.key) &&
    typeof variable.label === 'string' &&
    typeof variable.defaultValue === 'string' &&
    variable.required === true;
}

function ToolbarButton({
  label,
  active,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active === undefined ? undefined : active}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-600 transition-colors',
        'hover:bg-white hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300',
        'disabled:cursor-not-allowed disabled:opacity-35',
        active && 'bg-slate-900 text-white shadow-sm hover:bg-slate-800 hover:text-white'
      )}
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return <span aria-hidden="true" className="mx-1 h-6 w-px shrink-0 bg-slate-200" />;
}

function ToolbarSelect({
  label,
  value,
  onChange,
  children,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <select
      aria-label={label}
      title={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={cn(
        'h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 outline-none',
        'focus:border-brand-400 focus:ring-2 focus:ring-brand-100',
        className
      )}
    >
      {children}
    </select>
  );
}

function ColorPanel({
  kind,
  selectedColor,
  onSelect,
  onReset,
  onClose,
}: {
  kind: 'text' | 'highlight';
  selectedColor: string;
  onSelect: (color: string) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const colors = kind === 'text' ? TEXT_COLORS : HIGHLIGHT_COLORS;
  const inputValue = /^#[0-9a-f]{6}$/i.test(selectedColor)
    ? selectedColor
    : kind === 'text'
      ? '#0f172a'
      : '#fef08a';

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2" role="group" aria-label={kind === 'text' ? 'Text color' : 'Highlight color'}>
      <span className="mr-1 text-xs font-semibold text-slate-600">{kind === 'text' ? 'Text color' : 'Highlight'}</span>
      {colors.map((color) => (
        <button
          key={color}
          type="button"
          aria-label={`Use ${color}`}
          title={color}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onSelect(color)}
          className={cn(
            'h-6 w-6 rounded-full border border-slate-200 shadow-sm transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300',
            selectedColor.toLowerCase() === color.toLowerCase() && 'ring-2 ring-brand-500 ring-offset-2'
          )}
          style={{ backgroundColor: color }}
        />
      ))}
      <label className="flex h-7 cursor-pointer items-center gap-1 rounded-md border border-slate-200 px-2 text-xs text-slate-600 hover:bg-slate-50">
        Custom
        <input
          type="color"
          value={inputValue}
          onChange={(event) => onSelect(event.target.value)}
          className="h-4 w-4 cursor-pointer border-0 bg-transparent p-0"
          aria-label={`Custom ${kind} color`}
        />
      </label>
      <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={onReset} className="rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100">Reset</button>
      <button type="button" aria-label="Close color picker" onClick={onClose} className="ml-auto rounded-md p-1 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button>
    </div>
  );
}

function LinkPanel({
  href,
  text,
  hasLink,
  onHrefChange,
  onTextChange,
  onApply,
  onRemove,
  onClose,
}: {
  href: string;
  text: string;
  hasLink: boolean;
  onHrefChange: (value: string) => void;
  onTextChange: (value: string) => void;
  onApply: () => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      onApply();
    }
    if (event.key === 'Escape') onClose();
  };

  return (
    <div className="border-b border-slate-200 bg-white px-3 py-3" role="dialog" aria-label="Edit link">
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-44 flex-1 text-xs font-medium text-slate-600">
          Link URL
          <input
            autoFocus
            value={href}
            onChange={(event) => onHrefChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="https://example.com"
            inputMode="url"
            className="mt-1 h-9 w-full rounded-md border border-slate-200 px-3 text-sm text-slate-900 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          />
        </label>
        {!hasLink && (
          <label className="min-w-36 flex-1 text-xs font-medium text-slate-600">
            Display text
            <input
              value={text}
              onChange={(event) => onTextChange(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Link text"
              className="mt-1 h-9 w-full rounded-md border border-slate-200 px-3 text-sm text-slate-900 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            />
          </label>
        )}
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={onApply} className="h-9 rounded-md bg-slate-900 px-3 text-sm font-semibold text-white hover:bg-slate-800">
          {hasLink ? 'Update link' : 'Add link'}
        </button>
        {hasLink && <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={onRemove} className="h-9 rounded-md border border-slate-200 px-3 text-sm font-medium text-rose-700 hover:bg-rose-50"><Unlink2 className="mr-1 inline h-4 w-4" />Remove</button>}
        <button type="button" aria-label="Close link editor" onClick={onClose} className="mb-1 rounded-md p-1.5 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

function ImagePanel({
  value,
  onChange,
  onInsert,
  onClose,
}: {
  value: string;
  onChange: (value: string) => void;
  onInsert: () => void;
  onClose: () => void;
}) {
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      onInsert();
    }
    if (event.key === 'Escape') onClose();
  };

  return (
    <div className="border-b border-slate-200 bg-white px-3 py-3" role="dialog" aria-label="Insert image">
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-72 flex-1 text-xs font-medium text-slate-600">
          Image URL
          <input
            autoFocus
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="https://example.com/image.png"
            className="mt-1 h-9 w-full rounded-md border border-slate-200 px-3 text-sm text-slate-900 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          />
        </label>
        <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={onInsert} className="h-9 rounded-md bg-slate-900 px-3 text-sm font-semibold text-white hover:bg-slate-800">
          Insert image
        </button>
        <button type="button" aria-label="Close image editor" onClick={onClose} className="mb-1 rounded-md p-1.5 text-slate-500 hover:bg-slate-100"><X className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

function AIWritingPanel({
  target,
  mode,
  instruction,
  busy,
  error,
  variableIntegrityError,
  canCreateSmartVariables,
  allowNewVariables,
  suggestionVariables,
  suggestion,
  stale,
  suggestedPrompts,
  promptContextLabel,
  instructionRef,
  onModeChange,
  onInstructionChange,
  onAllowNewVariablesChange,
  onPromptSelect,
  onGenerate,
  onCancel,
  onCopy,
  onApply,
  onAppend,
  onClose,
}: {
  target: SelectionSnapshot | null;
  mode: WritingAssistMode;
  instruction: string;
  busy: boolean;
  error: string;
  variableIntegrityError: boolean;
  canCreateSmartVariables: boolean;
  allowNewVariables: boolean;
  suggestionVariables: TemplateVariableDefinition[];
  suggestion: string;
  stale: boolean;
  suggestedPrompts: DocumentWritingPrompt[];
  promptContextLabel: string | null;
  instructionRef: RefObject<HTMLTextAreaElement | null>;
  onModeChange: (mode: WritingAssistMode) => void;
  onInstructionChange: (value: string) => void;
  onAllowNewVariablesChange: (enabled: boolean) => void;
  onPromptSelect: (prompt: DocumentWritingPrompt) => void;
  onGenerate: () => void;
  onCancel: () => void;
  onCopy: () => void;
  onApply: () => void;
  onAppend: () => void;
  onClose: () => void;
}) {
  const sourceText = target?.selectedText || target?.sectionText || '';
  const canMakeDetailsEditable = canCreateSmartVariables && mode === 'draft';
  const smartVariableCount = suggestionVariables.length;
  const smartVariableNoun = smartVariableCount === 1 ? 'variable' : 'variables';
  const primaryLabel = target?.selectedText
    ? 'Replace selection'
    : target?.sectionText
      ? 'Replace section'
      : 'Add draft';
  const applyLabel = smartVariableCount > 0
    ? `Apply draft & add ${smartVariableCount} ${smartVariableNoun}`
    : primaryLabel;
  const appendLabel = target?.selectedText ? 'Insert after selection' : 'Append to section';

  const handleInstructionKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      if (!busy) onGenerate();
    }
    if (event.key === 'Escape' && !busy) onClose();
  };

  return (
    <section className="border-b border-violet-200 bg-linear-to-b from-violet-50/80 to-white" aria-label="AI writing assistant">
      <div className="flex items-start justify-between gap-3 border-b border-violet-100 px-3 py-2.5">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-violet-600 text-white"><WandSparkles className="h-3.5 w-3.5" /></span>
            <div><h3 className="text-sm font-semibold text-slate-950">AI writing assistant</h3><p className="text-[11px] text-slate-500">AI can make mistakes — review legal meaning before applying anything.</p></div>
          </div>
        </div>
        <button type="button" aria-label="Close AI writing assistant" onClick={onClose} className="rounded-md p-1 text-slate-500 hover:bg-white"><X className="h-4 w-4" /></button>
      </div>

      <div className="space-y-3 p-3"> 
        <div>
          <p className="mb-1.5 text-[11px] font-semibold text-slate-700">Choose an action</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {AI_MODES.map((option) => {
              const Icon = option.icon;
              const active = mode === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  title={option.description}
                  aria-pressed={active}
                  disabled={busy || (!sourceText && option.value !== 'draft')}
                  onClick={() => onModeChange(option.value)}
                  className={cn(
                    'flex min-h-9 items-center gap-1.5 rounded-lg border px-2 py-1.5 text-left text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 disabled:cursor-not-allowed disabled:opacity-40',
                    active ? 'border-violet-500 bg-violet-600 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-700 hover:border-violet-200 hover:bg-violet-50'
                  )}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />{option.label}
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-[11px] text-slate-500">{AI_MODES.find((option) => option.value === mode)?.description}</p>
        </div>

        {canMakeDetailsEditable && (
          <label className="flex cursor-pointer gap-2 rounded-lg border border-violet-200 bg-violet-50/70 p-2.5 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={allowNewVariables}
              disabled={busy || Boolean(suggestion)}
              onChange={(event) => onAllowNewVariablesChange(event.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-violet-300 text-violet-600 focus:ring-violet-400"
            />
            <span>
              <span className="font-semibold text-slate-900">Make changeable details editable</span>
              <span className="mt-0.5 block leading-5">AI can add Smart variables for names, price, address, and dates. Set their values in Builder before sending the envelope.</span>
            </span>
          </label>
        )}

        {!suggestion && suggestedPrompts.length > 0 && (
          <div className="rounded-lg border border-violet-100 bg-white/80 p-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] font-semibold text-slate-700">Suggested questions</p>
              {promptContextLabel && <span className="text-[10px] text-violet-700">{promptContextLabel}</span>}
            </div>
            <p className="mt-1 text-[11px] leading-5 text-slate-500">Choose one to prefill the assistant with a question based on this agreement.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {suggestedPrompts.map((prompt) => (
                <button
                  key={prompt.id}
                  type="button"
                  disabled={busy}
                  title={prompt.instruction}
                  aria-label={`Use suggested question: ${prompt.instruction}`}
                  onClick={() => onPromptSelect(prompt)}
                  className="rounded-full border border-violet-200 bg-violet-50 px-2 py-1 text-[11px] font-medium text-violet-800 transition-colors hover:border-violet-300 hover:bg-violet-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {prompt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="block text-[11px] font-semibold text-slate-700">
          <label htmlFor="ai-writing-instruction">
          {mode === 'draft' ? 'What should the clause say?' : 'Additional instructions (optional)'}
          </label>
          <textarea
            id="ai-writing-instruction"
            ref={instructionRef}
            value={instruction}
            maxLength={2000}
            rows={2}
            disabled={busy}
            onChange={(event) => onInstructionChange(event.target.value)}
            onKeyDown={handleInstructionKeyDown}
            placeholder={mode === 'draft' ? 'Example: Draft a mutual confidentiality clause with a two-year term…' : 'Example: Keep the defined terms and soften the tone…'}
            aria-describedby="ai-writing-shortcut"
            className="mt-1 w-full resize-y rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm font-normal leading-5 text-slate-900 outline-none placeholder:text-slate-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-100 disabled:bg-slate-50"
          />
          <span id="ai-writing-shortcut" className="mt-1 flex justify-between text-[10px] font-normal text-slate-400"><span>Press Ctrl/⌘ + Enter to generate</span><span>{instruction.length}/2000</span></span>
        </div>

        {error && (
          variableIntegrityError ? (
            <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
              <p className="font-semibold">That suggestion altered an existing Smart variable, so we didn’t use it.</p>
              <p className="mt-1">Your document is unchanged. Your request is fine—select Try again for a fresh suggestion.</p>
            </div>
          ) : <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700">{error}</div>
        )}

        {!suggestion && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy || (!sourceText && instruction.trim().length < 5) || (mode === 'draft' && instruction.trim().length < 5)}
              onClick={onGenerate}
              className="inline-flex h-8 items-center gap-2 rounded-lg bg-violet-600 px-3 text-sm font-semibold text-white shadow-sm hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? <><LoaderCircle className="h-4 w-4 animate-spin" />Generating suggestion…</> : variableIntegrityError ? <><RefreshCw className="h-4 w-4" />Try again</> : <><Sparkles className="h-4 w-4" />Generate suggestion</>}
            </button>
            {busy && <button type="button" onClick={onCancel} className="h-9 rounded-lg px-3 text-sm font-medium text-slate-600 hover:bg-white">Cancel</button>}
          </div>
        )}

        {suggestion && (
          <div className="overflow-hidden rounded-xl border border-violet-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-violet-100 bg-violet-50/70 px-3 py-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-violet-800"><Check className="h-4 w-4" />Suggestion ready</div>
              <div className="flex items-center gap-1">
                <button type="button" title="Copy suggestion" aria-label="Copy suggestion" onClick={onCopy} className="rounded-md p-1.5 text-slate-500 hover:bg-white"><Copy className="h-4 w-4" /></button>
                <button type="button" title="Regenerate suggestion" aria-label="Regenerate suggestion" onClick={onGenerate} className="rounded-md p-1.5 text-slate-500 hover:bg-white"><RefreshCw className="h-4 w-4" /></button>
              </div>
            </div>
            <div className="max-h-48 overflow-y-auto whitespace-pre-wrap px-3 py-2.5 text-sm leading-6 text-slate-800">{suggestion}</div>
            {smartVariableCount > 0 && (
              <div className="border-t border-sky-200 bg-sky-50 px-3 py-2 text-xs leading-5 text-sky-900">
                <p className="font-semibold">{smartVariableCount} Smart {smartVariableNoun} will be added when you apply this draft.</p>
                <p className="mt-0.5">Set their values in Builder before sending the envelope.</p>
              </div>
            )}
            {stale && <div className="border-t border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">The section changed after this request. Regenerate before applying the suggestion.</div>}
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-3 py-2.5">
              <button type="button" disabled={stale} onClick={onApply} className="inline-flex h-8 items-center gap-2 rounded-lg bg-violet-600 px-3 text-sm font-semibold text-white hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-45"><Check className="h-4 w-4" />{applyLabel}</button>
              {sourceText && <button type="button" disabled={stale} onClick={onAppend} className="h-8 rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45">{appendLabel}</button>}
              <button type="button" onClick={onClose} className="ml-auto h-8 rounded-lg px-3 text-sm font-medium text-slate-500 hover:bg-slate-50">Discard</button>
            </div>
          </div>
        )}

        <div className="sr-only" aria-live="polite">{busy ? 'Generating AI suggestion' : suggestion ? 'AI suggestion ready for review' : ''}</div>
      </div>
    </section>
  );
}

export default function RichTextSectionEditor({
  templateId,
  documentId,
  aiEnabled = true,
  documentName,
  documentText,
  html,
  placeholder,
  className,
  onChange,
  onSmartVariablesDetected,
  onReady,
}: Props) {
  const aiResource = templateId
    ? { templateId }
    : documentId
      ? { documentId }
      : null;
  const canUseAi = aiEnabled && Boolean(aiResource);
  const [openPanel, setOpenPanel] = useState<OpenPanel>(null);
  const [tableMenuOpen, setTableMenuOpen] = useState(false);
  const [linkHref, setLinkHref] = useState('');
  const [linkText, setLinkText] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [linkHadMark, setLinkHadMark] = useState(false);
  const [aiMode, setAiMode] = useState<WritingAssistMode>('rewrite');
  const [instruction, setInstruction] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiVariableIntegrityError, setAiVariableIntegrityError] = useState(false);
  const [aiAllowNewVariables, setAiAllowNewVariables] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState('');
  const [aiSuggestionVariables, setAiSuggestionVariables] = useState<TemplateVariableDefinition[]>([]);
  const [aiTarget, setAiTarget] = useState<SelectionSnapshot | null>(null);
  const [aiStale, setAiStale] = useState(false);
  const onReadyRef = useRef(onReady);
  const linkTargetRef = useRef<SelectionSnapshot | null>(null);
  const aiAbortRef = useRef<AbortController | null>(null);
  const aiRequestIdRef = useRef(0);
  const instructionRef = useRef<HTMLTextAreaElement | null>(null);

  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    extensions: [
      StarterKit.configure({ codeBlock: false, horizontalRule: false, link: false }),
      TextStyle,
      FontFamily,
      FontSize,
      LineHeight,
      Color,
      Highlight.configure({ multicolor: true }),
      Link.configure({ openOnClick: false, autolink: true, defaultProtocol: 'https' }),
      Image.configure({ allowBase64: true }),
      Table.configure({
        resizable: true,
        handleWidth: 8,
        cellMinWidth: 72,
        lastColumnResizable: true,
        HTMLAttributes: {
          class: 'border-collapse overflow-hidden rounded-md',
        },
      }),
      TableRow,
      TableHeader,
      TableCell,
      Subscript,
      Superscript,
      HorizontalRule,
      TextAlign.configure({ types: ['heading', 'paragraph'], alignments: ['left', 'center', 'right', 'justify'] }),
      Placeholder.configure({ placeholder }),
    ],
    content: html,
    editorProps: {
      attributes: {
        class: cn(
          'tiptap min-h-24 px-3 py-3 outline-none',
          '[&_a]:cursor-pointer [&_a]:text-brand-700 [&_a]:underline [&_a]:underline-offset-2',
          '[&_blockquote]:my-3 [&_blockquote]:border-l-4 [&_blockquote]:border-slate-300 [&_blockquote]:pl-3 [&_blockquote]:text-slate-600',
          '[&_code]:rounded [&_code]:bg-slate-100 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.9em]',
          '[&_hr]:my-4 [&_hr]:border-slate-300',
          '[&_img]:my-3 [&_img]:max-h-80 [&_img]:max-w-full [&_img]:rounded-lg [&_img]:border [&_img]:border-slate-200',
          '[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_table]:my-4 [&_table]:w-full [&_table]:border-collapse [&_table]:overflow-hidden [&_td]:border [&_td]:border-slate-300 [&_td]:px-2 [&_td]:py-2 [&_th]:border [&_th]:border-slate-300 [&_th]:bg-slate-50 [&_th]:px-2 [&_th]:py-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6 [&_.tableWrapper]:overflow-x-auto [&_.tableWrapper]:rounded-lg [&_.tableWrapper]:border [&_.tableWrapper]:border-slate-200 [&_.tableWrapper]:p-1',
          '[&_p.is-editor-empty:first-child:before]:pointer-events-none [&_p.is-editor-empty:first-child:before]:float-left [&_p.is-editor-empty:first-child:before]:h-0 [&_p.is-editor-empty:first-child:before]:text-slate-400 [&_p.is-editor-empty:first-child:before]:content-[attr(data-placeholder)]',
          className
        ),
        spellcheck: 'true',
      },
    },
    onUpdate: ({ editor: current }) => onChange(current.getHTML(), current.getText({ blockSeparator: '\n' })),
  });

  const editorState = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      if (!current) return EMPTY_EDITOR_STATE;
      const text = current.getText({ blockSeparator: '\n' });
      const textStyle = current.getAttributes('textStyle');
      const highlight = current.getAttributes('highlight');
      const block: EditorViewState['block'] = current.isActive('heading', { level: 1 })
        ? 'heading-1'
        : current.isActive('heading', { level: 2 })
          ? 'heading-2'
          : current.isActive('heading', { level: 3 })
            ? 'heading-3'
            : current.isActive('blockquote')
              ? 'blockquote'
              : 'paragraph';
      const align: EditorViewState['align'] = current.isActive({ textAlign: 'center' })
        ? 'center'
        : current.isActive({ textAlign: 'right' })
          ? 'right'
          : current.isActive({ textAlign: 'justify' })
            ? 'justify'
            : 'left';

      return {
        block,
        canUndo: current.can().undo(),
        canRedo: current.can().redo(),
        bold: current.isActive('bold'),
        italic: current.isActive('italic'),
        underline: current.isActive('underline'),
        strike: current.isActive('strike'),
        code: current.isActive('code'),
        subscript: current.isActive('subscript'),
        superscript: current.isActive('superscript'),
        bulletList: current.isActive('bulletList'),
        orderedList: current.isActive('orderedList'),
        blockquote: current.isActive('blockquote'),
        link: current.isActive('link'),
        align,
        fontFamily: String(textStyle.fontFamily || ''),
        fontSize: String(textStyle.fontSize || ''),
        lineHeight: String(textStyle.lineHeight || ''),
        color: String(textStyle.color || ''),
        highlightColor: String(highlight.color || ''),
        words: getWordCount(text),
        characters: text.length,
      };
    },
  }) || EMPTY_EDITOR_STATE;

  const captureSelection = useCallback((): SelectionSnapshot | null => {
    if (!editor) return null;
    const { from, to } = editor.state.selection;
    return {
      from,
      to,
      selectedText: editor.state.doc.textBetween(from, to, '\n').slice(0, 12_000),
      sectionText: editor.getText({ blockSeparator: '\n' }).slice(0, 12_000),
      documentFingerprint: JSON.stringify(editor.getJSON()),
    };
  }, [editor]);

  const cancelAiRequest = useCallback(() => {
    aiAbortRef.current?.abort();
    aiAbortRef.current = null;
    aiRequestIdRef.current += 1;
    setAiBusy(false);
  }, []);

  const closePanel = useCallback(() => {
    if (openPanel === 'ai') cancelAiRequest();
    setOpenPanel(null);
    setAiError('');
    setAiVariableIntegrityError(false);
    setAiSuggestionVariables([]);
  }, [cancelAiRequest, openPanel]);

  const togglePanel = useCallback((panel: Exclude<OpenPanel, null>) => {
    if (openPanel === 'ai' && panel !== 'ai') cancelAiRequest();
    setOpenPanel((current) => current === panel ? null : panel);
  }, [cancelAiRequest, openPanel]);

  useEffect(() => { onReadyRef.current = onReady; }, [onReady]);
  useEffect(() => {
    if (!editor) return;
    onReadyRef.current?.((value) => {
      editor.chain().focus().insertContent({ type: 'text', text: value }).run();
    });
    return () => onReadyRef.current?.(null);
  }, [editor]);
  useEffect(() => {
    if (editor && editor.getHTML() !== html) editor.commands.setContent(html, { emitUpdate: false });
  }, [editor, html]);
  useEffect(() => () => aiAbortRef.current?.abort(), []);
  useEffect(() => {
    if (openPanel === 'ai' && !aiSuggestion) requestAnimationFrame(() => instructionRef.current?.focus());
  }, [aiSuggestion, openPanel]);

  const documentWritingPrompts = useMemo(() => getDocumentWritingPrompts({
    documentName,
    documentText,
    sectionText: aiTarget?.sectionText || '',
    selectedText: aiTarget?.selectedText || '',
  }), [aiTarget, documentName, documentText]);

  if (!editor) return <div className="min-h-24 animate-pulse bg-slate-50" />;

  const tableActions = [
    { label: 'Insert table', icon: TableIcon, action: () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
    { label: 'Add row above', icon: PanelTop, action: () => editor.chain().focus().addRowBefore().run() },
    { label: 'Add row below', icon: PanelBottom, action: () => editor.chain().focus().addRowAfter().run() },
    { label: 'Add column before', icon: PanelLeft, action: () => editor.chain().focus().addColumnBefore().run() },
    { label: 'Add column after', icon: PanelRight, action: () => editor.chain().focus().addColumnAfter().run() },
    { label: 'Delete current row', icon: Rows2, action: () => editor.chain().focus().deleteRow().run(), destructive: true  },
    { label: 'Delete current column', icon: Columns2, action: () => editor.chain().focus().deleteColumn().run(), destructive: true  },
    { label: 'Delete table', icon: Trash, action: () => editor.chain().focus().deleteTable().run(), destructive: true },
  ];

  const changeBlock = (value: string) => {
    const chain = editor.chain().focus();
    if (value === 'heading-1') chain.setHeading({ level: 1 }).run();
    else if (value === 'heading-2') chain.setHeading({ level: 2 }).run();
    else if (value === 'heading-3') chain.setHeading({ level: 3 }).run();
    else if (value === 'blockquote') {
      if (!editor.isActive('blockquote')) chain.toggleBlockquote().run();
    } else chain.setParagraph().run();
  };

  const openLinkPanel = () => {
    const snapshot = captureSelection();
    if (!snapshot) return;
    const href = String(editor.getAttributes('link').href || '');
    const hasLink = editor.isActive('link');
    linkTargetRef.current = snapshot;
    setLinkHadMark(hasLink);
    setLinkHref(href);
    setLinkText(snapshot.selectedText);
    setOpenPanel((current) => current === 'link' ? null : 'link');
  };

  const openImagePanel = () => {
    setImageUrl('');
    setOpenPanel((current) => current === 'image' ? null : 'image');
  };

  const insertImage = () => {
    const trimmed = imageUrl.trim();
    if (!trimmed) return toast.error('Paste an image URL to insert an image.');
    const isDataUrl = trimmed.startsWith('data:image/');
    const isRemoteUrl = /^https?:\/\//i.test(trimmed);
    if (!isDataUrl && !isRemoteUrl) return toast.error('Use a valid http, https, or data:image URL.');

    editor.chain().focus().setImage({ src: trimmed, alt: 'Inserted image' }).run();
    setImageUrl('');
    setOpenPanel(null);
  };

  const applyLink = () => {
    const target = linkTargetRef.current;
    const href = normalizeLinkUrl(linkHref);
    if (!href) return toast.error('Enter a valid http, https, or email link');
    if (!target || JSON.stringify(editor.getJSON()) !== target.documentFingerprint) return toast.error('The text changed. Select it again before adding the link.');

    if (target.from !== target.to) {
      const displayText = linkText.trim() || target.selectedText;
      editor.chain().focus().insertContentAt(
        { from: target.from, to: target.to },
        { type: 'text', text: displayText, marks: [{ type: 'link', attrs: { href } }] }
      ).run();
    } else if (linkHadMark) {
      editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
    } else {
      const displayText = linkText.trim();
      if (!displayText) return toast.error('Add display text for the new link');
      editor.chain().focus().insertContent({ type: 'text', text: displayText, marks: [{ type: 'link', attrs: { href } }] }).run();
    }
    setOpenPanel(null);
  };

  const removeLink = () => {
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
    setOpenPanel(null);
  };

  const openAiPanel = () => {
    if (openPanel === 'ai') {
      closePanel();
      return;
    }
    const target = captureSelection();
    if (!target) return;
    setAiTarget(target);
    setAiMode(target.sectionText ? 'rewrite' : 'draft');
    setAiAllowNewVariables(Boolean(documentId));
    setAiSuggestion('');
    setAiSuggestionVariables([]);
    setAiError('');
    setAiVariableIntegrityError(false);
    setAiStale(false);
    setOpenPanel('ai');
  };

  const askAI = async () => {
    if (!canUseAi || !aiResource) return;
    const target = aiTarget || captureSelection();
    if (!target) return;
    const allowNewVariables = Boolean(documentId) && aiMode === 'draft' && aiAllowNewVariables;
    if (aiMode === 'draft' && instruction.trim().length < 5) {
      setAiVariableIntegrityError(false);
      setAiError('Describe what you want drafted in at least 5 characters.');
      return;
    }
    if (!target.selectedText && !target.sectionText && instruction.trim().length < 5) {
      setAiVariableIntegrityError(false);
      setAiError('Add a short instruction so the assistant knows what to draft.');
      return;
    }

    aiAbortRef.current?.abort();
    const controller = new AbortController();
    aiAbortRef.current = controller;
    const requestId = aiRequestIdRef.current + 1;
    aiRequestIdRef.current = requestId;
    setAiBusy(true);
    setAiError('');
    setAiVariableIntegrityError(false);
    setAiSuggestion('');
    setAiSuggestionVariables([]);
    setAiStale(false);

    try {
      const csrfToken = getCookieValue('csrf_token');
      const response = await fetch('/api/ai/template-writing-assistant', {
        method: 'POST',
        credentials: 'include',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
        },
        body: JSON.stringify({
          ...aiResource,
          mode: aiMode,
          allowNewVariables,
          instruction,
          selectedText: target.selectedText,
          sectionText: target.sectionText,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (body?.code === 'WRITING_PLACEHOLDER_INTEGRITY_FAILED') {
          setAiVariableIntegrityError(true);
          setAiError('The assistant changed a Smart variable.');
          return;
        }
        throw new Error(body?.message || 'Unable to generate a writing suggestion');
      }
      const suggestion = String(body?.suggestion || '').trim();
      if (!suggestion) throw new Error('The assistant returned an empty suggestion. Try a more specific instruction.');
      if (requestId !== aiRequestIdRef.current) return;
      setAiSuggestion(suggestion);
      setAiSuggestionVariables(
        Array.isArray(body?.newVariables)
          ? body.newVariables.filter(isSmartVariableDefinition)
          : []
      );
      setAiStale(JSON.stringify(editor.getJSON()) !== target.documentFingerprint);
    } catch (error) {
      if (controller.signal.aborted || requestId !== aiRequestIdRef.current) return;
      setAiVariableIntegrityError(false);
      setAiError(error instanceof Error ? error.message : 'Unable to generate a writing suggestion');
    } finally {
      if (requestId === aiRequestIdRef.current) {
        aiAbortRef.current = null;
        setAiBusy(false);
      }
    }
  };

  const selectSuggestedPrompt = (prompt: DocumentWritingPrompt) => {
    setAiMode(prompt.mode);
    setAiAllowNewVariables(Boolean(documentId) && prompt.mode === 'draft');
    setInstruction(prompt.instruction);
    setAiError('');
    setAiVariableIntegrityError(false);
    setAiSuggestion('');
    setAiSuggestionVariables([]);
    setAiStale(false);
    requestAnimationFrame(() => instructionRef.current?.focus());
  };

  const changeAiMode = (mode: WritingAssistMode) => {
    setAiMode(mode);
    setAiAllowNewVariables(Boolean(documentId) && mode === 'draft');
    setAiError('');
    setAiVariableIntegrityError(false);
    setAiSuggestion('');
    setAiSuggestionVariables([]);
    setAiStale(false);
  };

  const changeAiInstruction = (value: string) => {
    setInstruction(value);
    setAiError('');
    setAiVariableIntegrityError(false);
    setAiSuggestionVariables([]);
    if (aiSuggestion) {
      setAiSuggestion('');
      setAiStale(false);
    }
  };

  const applySuggestion = (placement: 'replace' | 'append') => {
    if (!aiTarget || !aiSuggestion) return;
    if (JSON.stringify(editor.getJSON()) !== aiTarget.documentFingerprint) {
      setAiStale(true);
      return toast.error('The section changed. Regenerate the suggestion before applying it.');
    }

    const content = plainTextToTiptapHtml(aiSuggestion);
    if (placement === 'append') {
      const position = aiTarget.selectedText ? aiTarget.to : editor.state.doc.content.size;
      editor.chain().focus().insertContentAt(position, content).run();
    } else if (aiTarget.selectedText) {
      editor.chain().focus().insertContentAt({ from: aiTarget.from, to: aiTarget.to }, content).run();
    } else {
      editor.chain().focus().setContent(content).run();
    }

    if (aiSuggestionVariables.length > 0) {
      onSmartVariablesDetected?.(aiSuggestionVariables);
    }
    setAiSuggestion('');
    setAiSuggestionVariables([]);
    setInstruction('');
    setOpenPanel(null);
    toast.success(
      aiSuggestionVariables.length > 0
        ? `AI draft applied. Set ${aiSuggestionVariables.length} Smart ${aiSuggestionVariables.length === 1 ? 'variable' : 'variables'} in Builder before sending.`
        : 'AI suggestion applied. Review it before saving.'
    );
  };

  const copySuggestion = async () => {
    try {
      await navigator.clipboard.writeText(aiSuggestion);
      toast.success('Suggestion copied');
    } catch {
      toast.error('Unable to copy the suggestion');
    }
  };

  const handleEditorKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      openLinkPanel();
    }
    if (canUseAi && (event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'a') {
      event.preventDefault();
      openAiPanel();
    }
    if (event.key === 'Escape' && openPanel) closePanel();
  };

  return (
    <div className="overflow-hidden bg-white" onKeyDown={handleEditorKeyDown}>
      <div className="border-b border-slate-200 bg-slate-50/95" role="toolbar" aria-label="Rich text formatting">
        <div className="flex flex-wrap items-center gap-0.5 p-1.5">
          <ToolbarButton label="Undo (Ctrl/⌘ Z)" disabled={!editorState.canUndo} onClick={() => editor.chain().focus().undo().run()}><Undo2 className="h-4 w-4" /></ToolbarButton>
          <ToolbarButton label="Redo (Ctrl/⌘ Shift Z)" disabled={!editorState.canRedo} onClick={() => editor.chain().focus().redo().run()}><Redo2 className="h-4 w-4" /></ToolbarButton>
          <ToolbarDivider />
          <ToolbarSelect label="Text style" value={editorState.block} onChange={changeBlock} className="w-28">
            <option value="paragraph">Paragraph</option>
            <option value="heading-1">Heading 1</option>
            <option value="heading-2">Heading 2</option>
            <option value="heading-3">Heading 3</option>
            <option value="blockquote">Quote</option>
          </ToolbarSelect>
          <ToolbarSelect label="Font family" value={editorState.fontFamily} onChange={(value) => value ? editor.chain().focus().setFontFamily(value).run() : editor.chain().focus().unsetFontFamily().run()} className="w-28">
            {FONT_FAMILIES.map((font) => <option key={font.value || 'default'} value={font.value}>{font.label}</option>)}
          </ToolbarSelect>
          <ToolbarSelect label="Font size" value={editorState.fontSize} onChange={(value) => value ? editor.chain().focus().setFontSize(value).run() : editor.chain().focus().unsetFontSize().run()} className="w-20">
            {FONT_SIZES.map((size) => <option key={size || 'default'} value={size}>{size || 'Size'}</option>)}
          </ToolbarSelect>
          <ToolbarSelect label="Line spacing" value={editorState.lineHeight} onChange={(value) => value ? editor.chain().focus().setLineHeight(value).run() : editor.chain().focus().unsetLineHeight().run()} className="w-20">
            {LINE_HEIGHTS.map((height) => <option key={height || 'default'} value={height}>{height ? `${height}×` : 'Spacing'}</option>)}
          </ToolbarSelect>
          <ToolbarDivider />
          <ToolbarButton label="Bold (Ctrl/⌘ B)" active={editorState.bold} onClick={() => editor.chain().focus().toggleBold().run()}><Bold className="h-4 w-4" /></ToolbarButton>
          <ToolbarButton label="Italic (Ctrl/⌘ I)" active={editorState.italic} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic className="h-4 w-4" /></ToolbarButton>
          <ToolbarButton label="Underline (Ctrl/⌘ U)" active={editorState.underline} onClick={() => editor.chain().focus().toggleUnderline().run()}><Underline className="h-4 w-4" /></ToolbarButton>
          <ToolbarButton label="Strikethrough" active={editorState.strike} onClick={() => editor.chain().focus().toggleStrike().run()}><Strikethrough className="h-4 w-4" /></ToolbarButton>
          <ToolbarButton label="Inline code" active={editorState.code} onClick={() => editor.chain().focus().toggleCode().run()}><Code2 className="h-4 w-4" /></ToolbarButton>
          <ToolbarButton label="Text color" active={openPanel === 'text-color' || Boolean(editorState.color)} onClick={() => togglePanel('text-color')}><span className="relative"><Palette className="h-4 w-4" /><span className="absolute -bottom-1 left-0 h-0.5 w-4 rounded" style={{ backgroundColor: editorState.color || '#0f172a' }} /></span></ToolbarButton>
          <ToolbarButton label="Highlight color" active={openPanel === 'highlight' || Boolean(editorState.highlightColor)} onClick={() => togglePanel('highlight')}><Highlighter className="h-4 w-4" /></ToolbarButton>
          <ToolbarDivider />
          <ToolbarButton label="Bullet list" active={editorState.bulletList} onClick={() => editor.chain().focus().toggleBulletList().run()}><List className="h-4 w-4" /></ToolbarButton>
          <ToolbarButton label="Numbered list" active={editorState.orderedList} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered className="h-4 w-4" /></ToolbarButton>
          <ToolbarButton label="Block quote" active={editorState.blockquote} onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote className="h-4 w-4" /></ToolbarButton>
          <ToolbarDivider />
          {([
            ['left', AlignLeft],
            ['center', AlignCenter],
            ['right', AlignRight],
            ['justify', AlignJustify],
          ] as const).map(([align, Icon]) => (
            <ToolbarButton key={align} label={`Align ${align}`} active={editorState.align === align} onClick={() => editor.chain().focus().setTextAlign(align).run()}><Icon className="h-4 w-4" /></ToolbarButton>
          ))}
          <ToolbarDivider />
          <ToolbarButton label="Add or edit link (Ctrl/⌘ K)" active={editorState.link || openPanel === 'link'} onClick={openLinkPanel}><Link2 className="h-4 w-4" /></ToolbarButton>
          <ToolbarButton label="Insert image" active={openPanel === 'image'} onClick={openImagePanel}><ImageIcon className="h-4 w-4" /></ToolbarButton>
          <div className="relative">
            <button
              type="button"
              aria-label="Table actions"
              aria-expanded={tableMenuOpen}
              title="Table actions"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setTableMenuOpen((current) => !current)}
              className={`inline-flex h-8 items-center gap-1 rounded-md border border-slate-200  px-2 transition-colors hover:bg-slate-50 ${tableMenuOpen ? 'bg-black text-white hover:bg-black!' : 'bg-white text-slate-600'} `}
            >
              <TableIcon className="h-4 w-4" />
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {tableMenuOpen && (
              <div className="absolute left-1/2 -translate-x-1/2 top-full z-20 mt-1 flex  gap-1 rounded-lg border border-slate-200 bg-white p-1.5 shadow-lg">
                {tableActions.map(({ label, icon: Icon, action, destructive }) => (
                  <button
                    key={label}
                    type="button"
                    title={label}
                    aria-label={label}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      action();
                    }}
                    className={cn(
                      'inline-flex h-8 w-8 items-center justify-center text-slate-600 transition-colors hover:bg-slate-50',
                      destructive && 'border-rose-200 text-rose-600 hover:bg-rose-50'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                ))}
              </div>
            )}
          </div>
          <ToolbarButton label="Horizontal rule" onClick={() => editor.chain().focus().setHorizontalRule().run()}><Minus className="h-4 w-4" /></ToolbarButton>
          <ToolbarButton label="Subscript" active={editorState.subscript} onClick={() => editor.chain().focus().toggleSubscript().run()}><span className="text-[11px] font-semibold">x₂</span></ToolbarButton>
          <ToolbarButton label="Superscript" active={editorState.superscript} onClick={() => editor.chain().focus().toggleSuperscript().run()}><span className="text-[11px] font-semibold">x²</span></ToolbarButton>
          <ToolbarButton label="Clear formatting" onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}><RemoveFormatting className="h-4 w-4" /></ToolbarButton>
          {canUseAi && (
            <button
              type="button"
              aria-label="Write with AI"
              aria-expanded={openPanel === 'ai'}
              onMouseDown={(event) => event.preventDefault()}
              onClick={openAiPanel}
              className={cn(
                'ml-auto inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300',
                openPanel === 'ai' ? 'bg-violet-600 text-white shadow-sm' : 'border border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100'
              )}
            >
              <Sparkles className="h-3.5 w-3.5" />AI
            </button>
          )}
        </div>
      </div>

      {openPanel === 'text-color' && <ColorPanel kind="text" selectedColor={editorState.color} onSelect={(color) => editor.chain().focus().setColor(color).run()} onReset={() => editor.chain().focus().unsetColor().run()} onClose={() => setOpenPanel(null)} />}
      {openPanel === 'highlight' && <ColorPanel kind="highlight" selectedColor={editorState.highlightColor} onSelect={(color) => editor.chain().focus().setHighlight({ color }).run()} onReset={() => editor.chain().focus().unsetHighlight().run()} onClose={() => setOpenPanel(null)} />}
      {openPanel === 'link' && <LinkPanel href={linkHref} text={linkText} hasLink={linkHadMark} onHrefChange={setLinkHref} onTextChange={setLinkText} onApply={applyLink} onRemove={removeLink} onClose={() => setOpenPanel(null)} />}
      {openPanel === 'image' && <ImagePanel value={imageUrl} onChange={setImageUrl} onInsert={insertImage} onClose={() => setOpenPanel(null)} />}
      {canUseAi && openPanel === 'ai' && <AIWritingPanel target={aiTarget} mode={aiMode} instruction={instruction} busy={aiBusy} error={aiError} variableIntegrityError={aiVariableIntegrityError} canCreateSmartVariables={Boolean(documentId)} allowNewVariables={aiAllowNewVariables} suggestionVariables={aiSuggestionVariables} suggestion={aiSuggestion} stale={aiStale} suggestedPrompts={documentWritingPrompts.prompts} promptContextLabel={documentWritingPrompts.contextLabel} instructionRef={instructionRef} onModeChange={changeAiMode} onInstructionChange={changeAiInstruction} onAllowNewVariablesChange={setAiAllowNewVariables} onPromptSelect={selectSuggestedPrompt} onGenerate={() => void askAI()} onCancel={cancelAiRequest} onCopy={() => void copySuggestion()} onApply={() => applySuggestion('replace')} onAppend={() => applySuggestion('append')} onClose={closePanel} />}

      <EditorContent editor={editor} />
      <div className="flex items-center justify-between border-t border-slate-100 bg-white px-3 py-1.5 text-[11px] text-slate-400">
        <span>Rich text · links and formatting are preserved</span>
        <span>{editorState.words} words · {editorState.characters} characters</span>
      </div>
    </div>
  );
}
