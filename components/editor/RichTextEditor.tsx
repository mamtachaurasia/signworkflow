'use client';

import { forwardRef, useEffect, useImperativeHandle } from 'react';
import { Extension, getText, getTextSerializersFromSchema, type Editor } from '@tiptap/core';
import { EditorContent, useEditor, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import { FontFamily, FontSize, TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import Placeholder from '@tiptap/extension-placeholder';
import { Plugin } from '@tiptap/pm/state';
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, Bold, Italic, List, ListOrdered, Redo2, Strikethrough, Underline, Undo2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface RichTextEditorHandle { focus: () => void; element: HTMLDivElement | null; }
interface Props { value: string; onChange: (value: string) => void; mode?: 'html' | 'text'; readOnly?: boolean; placeholder?: string; toolbar?: boolean; maxLength?: number; maxLines?: number; className?: string; contentClassName?: string; onFocus?: () => void; }

type TextLimitSettings = Pick<Props, 'mode' | 'maxLength' | 'maxLines'>;
type TextLimitStorage = { limits: TextLimitSettings };

const EMPTY_TOOLBAR_STATE = {
  canUndo: false,
  canRedo: false,
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  bulletList: false,
  orderedList: false,
  alignLeft: false,
  alignCenter: false,
  alignRight: false,
  alignJustify: false,
};

const constrainTextValue = (value: string, { maxLength, maxLines }: TextLimitSettings) => {
  let next = value;
  if (typeof maxLines === 'number' && maxLines > 0) next = next.split('\n').slice(0, maxLines).join('\n');
  if (typeof maxLength === 'number' && maxLength >= 0) next = next.slice(0, maxLength);
  return next;
};

const textToEditorHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;')
  .replace(/\n/g, '<br>');

const textLimitOverage = (value: string, { maxLength, maxLines }: TextLimitSettings) => ({
  characters: typeof maxLength === 'number' && maxLength >= 0 ? Math.max(0, value.length - maxLength) : 0,
  lines: typeof maxLines === 'number' && maxLines > 0 ? Math.max(0, value.split('\n').length - maxLines) : 0,
});

const TextLimitExtension = Extension.create<Record<string, never>, TextLimitStorage>({
  name: 'builderTextLimits',
  addStorage: () => ({ limits: { mode: 'html' } }),
  addProseMirrorPlugins() {
    return [
      new Plugin({
        filterTransaction: (transaction, state) => {
          const limits = this.storage.limits;
          if (!transaction.docChanged || limits.mode !== 'text') return true;

          const textOptions = {
            blockSeparator: '\n',
            textSerializers: getTextSerializersFromSchema(transaction.doc.type.schema),
          };
          const previous = getText(state.doc, textOptions);
          const next = getText(transaction.doc, textOptions);
          const previousOverage = textLimitOverage(previous, limits);
          const nextOverage = textLimitOverage(next, limits);

          if (nextOverage.characters === 0 && nextOverage.lines === 0) return true;

          // If limits were tightened around existing content, still allow edits that
          // reduce an overage without increasing the other constraint.
          return nextOverage.characters <= previousOverage.characters
            && nextOverage.lines <= previousOverage.lines
            && (nextOverage.characters < previousOverage.characters || nextOverage.lines < previousOverage.lines);
        },
      }),
    ];
  },
});

const setEditorTextLimits = (editor: Editor, limits: TextLimitSettings) => {
  const storage = editor.storage as unknown as { builderTextLimits: TextLimitStorage };
  storage.builderTextLimits.limits = limits;
};

const Tool = ({ active, disabled, label, onClick, children }: { active?: boolean; disabled?: boolean; label: string; onClick: () => void; children: React.ReactNode }) => (
  <button
    type="button"
    aria-label={label}
    aria-pressed={active === undefined ? undefined : active}
    title={label}
    disabled={disabled}
    onMouseDown={(event) => event.preventDefault()}
    onClick={onClick}
    className={cn('rounded p-1.5 text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40', active && 'bg-slate-900 text-white hover:bg-slate-800')}
  >
    {children}
  </button>
);

const RichTextEditor = forwardRef<RichTextEditorHandle, Props>(function RichTextEditor({ value, onChange, mode = 'html', readOnly = false, placeholder = 'Start typing…', toolbar = false, maxLength, maxLines, className, contentClassName, onFocus }, ref) {
  const constrainedValue = mode === 'text'
    ? constrainTextValue(value, { mode, maxLength, maxLines })
    : value;
  const editor = useEditor({
    immediatelyRender: false,
    editable: !readOnly,
    extensions: [StarterKit.configure({ link: { openOnClick: false, autolink: true } }), TextStyle, FontFamily, FontSize, Color, Highlight.configure({ multicolor: true }), TextAlign.configure({ types: ['heading', 'paragraph'] }), Placeholder.configure({ placeholder }), TextLimitExtension],
    content: mode === 'text' ? textToEditorHtml(constrainedValue) : constrainedValue,
    editorProps: { attributes: { class: cn('h-full min-h-[1.5rem] w-full outline-none', contentClassName) } },
    onCreate: ({ editor: current }) => setEditorTextLimits(current, { mode, maxLength, maxLines }),
    onFocus,
    onUpdate: ({ editor: current }) => {
      if (mode === 'html') return onChange(current.getHTML());
      const next = constrainTextValue(current.getText({ blockSeparator: '\n' }), { mode, maxLength, maxLines });
      onChange(next);
    },
  });

  const toolbarState = useEditorState({
    editor,
    selector: ({ editor: current }) => current ? {
      canUndo: current.can().undo(),
      canRedo: current.can().redo(),
      bold: current.isActive('bold'),
      italic: current.isActive('italic'),
      underline: current.isActive('underline'),
      strike: current.isActive('strike'),
      bulletList: current.isActive('bulletList'),
      orderedList: current.isActive('orderedList'),
      alignLeft: current.isActive({ textAlign: 'left' }),
      alignCenter: current.isActive({ textAlign: 'center' }),
      alignRight: current.isActive({ textAlign: 'right' }),
      alignJustify: current.isActive({ textAlign: 'justify' }),
    } : EMPTY_TOOLBAR_STATE,
  }) ?? EMPTY_TOOLBAR_STATE;

  useImperativeHandle(ref, () => ({ focus: () => editor?.commands.focus(), element: editor?.view.dom.parentElement as HTMLDivElement | null }), [editor]);
  useEffect(() => { editor?.setEditable(!readOnly); }, [editor, readOnly]);
  useEffect(() => {
    if (editor) setEditorTextLimits(editor, { mode, maxLength, maxLines });
  }, [editor, maxLength, maxLines, mode]);
  useEffect(() => {
    if (!editor) return;
    const current = mode === 'html' ? editor.getHTML() : editor.getText({ blockSeparator: '\n' });
    if (current !== constrainedValue) editor.commands.setContent(mode === 'text' ? textToEditorHtml(constrainedValue) : constrainedValue, { emitUpdate: false });
  }, [constrainedValue, editor, mode]);
  if (!editor) return <div className={className} />;

  return <div className={cn('overflow-hidden', className)}>
    {toolbar && !readOnly && <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-200 bg-white p-1">
      <Tool label="Undo" disabled={!toolbarState.canUndo} onClick={() => editor.chain().focus().undo().run()}><Undo2 className="h-4 w-4" /></Tool><Tool label="Redo" disabled={!toolbarState.canRedo} onClick={() => editor.chain().focus().redo().run()}><Redo2 className="h-4 w-4" /></Tool><span className="mx-1 h-5 border-l border-slate-200" />
      <Tool label="Bold" active={toolbarState.bold} onClick={() => editor.chain().focus().toggleBold().run()}><Bold className="h-4 w-4" /></Tool><Tool label="Italic" active={toolbarState.italic} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic className="h-4 w-4" /></Tool><Tool label="Underline" active={toolbarState.underline} onClick={() => editor.chain().focus().toggleUnderline().run()}><Underline className="h-4 w-4" /></Tool><Tool label="Strike" active={toolbarState.strike} onClick={() => editor.chain().focus().toggleStrike().run()}><Strikethrough className="h-4 w-4" /></Tool>
      <Tool label="Bullet list" active={toolbarState.bulletList} onClick={() => editor.chain().focus().toggleBulletList().run()}><List className="h-4 w-4" /></Tool><Tool label="Numbered list" active={toolbarState.orderedList} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered className="h-4 w-4" /></Tool>
      {([['left', AlignLeft, toolbarState.alignLeft], ['center', AlignCenter, toolbarState.alignCenter], ['right', AlignRight, toolbarState.alignRight], ['justify', AlignJustify, toolbarState.alignJustify]] as const).map(([align, Icon, active]) => <Tool key={align} label={`Align ${align}`} active={active} onClick={() => editor.chain().focus().setTextAlign(align).run()}><Icon className="h-4 w-4" /></Tool>)}
    </div>}
    <EditorContent editor={editor} className="h-full" />
  </div>;
});
export default RichTextEditor;
