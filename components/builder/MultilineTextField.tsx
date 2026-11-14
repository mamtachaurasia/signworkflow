'use client';
import { forwardRef } from 'react';
import RichTextEditor, { RichTextEditorHandle } from '@/components/editor/RichTextEditor';

interface MultilineTextFieldProps {
  value?: string;
  textInput: (data: string) => void;
  readOnly?: boolean;
  placeholder?: string;
  maxLength?: number;
  maxLines?: number;
}

const MultilineTextField = forwardRef<RichTextEditorHandle, MultilineTextFieldProps>((props, ref) => {
  const { value = '', textInput, readOnly = false, placeholder = 'Type here...', maxLength, maxLines } = props;

  return (
    <RichTextEditor
      ref={ref}
      value={value}
      onChange={textInput}
      mode="text"
      placeholder={readOnly ? '' : placeholder}
      maxLength={maxLength}
      maxLines={maxLines}
      readOnly={readOnly}
      className={`h-full w-full overflow-auto bg-white ${readOnly ? 'cursor-default' : 'cursor-text'}`}
      contentClassName="wrap-break-word whitespace-pre-wrap px-2 py-1 text-xs leading-tight [&_p]:m-0"
    />
  );
});

MultilineTextField.displayName = 'MultilineTextField';

export default MultilineTextField;
