import type React from 'react';

export type FieldOwner = 'me' | 'recipients';

export interface ImageFieldProps {
  image: string | null;
}

export interface FieldsProps {
  mouseDown: (label: string, event: React.MouseEvent<HTMLDivElement>, fieldOwner: FieldOwner) => void;
  activeComponent: DroppingField | null;
  handleSave?: () => void;
  handleSend?: () => void;
  selectedFile: File | null;
}

export interface DroppingField {
  component: string;
  x: number;
  y: number;
  fieldOwner?: FieldOwner;
  data?: string | null;
}

export type FieldValidationKind = 'none' | 'email' | 'regex' | 'number' | 'date';
export type FieldInputType = 'text' | 'email' | 'phone' | 'number';

export interface FieldPropertySettings {
  label?: string;
  hint?: string;
  readOnly?: boolean;
  allowResize?: boolean;
  inputType?: FieldInputType;
  multiline?: boolean;
  minLength?: number;
  maxLength?: number;
  maxLines?: number;
  minValue?: number;
  maxValue?: number;
  defaultValue?: string;
  dateFormat?: string;
  validationKind?: FieldValidationKind;
  validationPattern?: string;
  validationMessage?: string;
  options?: string[];
  checkedValue?: string;
  uncheckedValue?: string;
}

export interface PageRect {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

export interface DroppedComponent extends DroppingField {
  id: number;
  fieldId?: string;
  repeatGroupId?: string;
  repeatSourceId?: string;
  component: string;
  x: number;
  y: number;
  width: number;
  height: number;
  data?: string | null;
  pageNumber?: number;
  mimeType?: string;
  assignedRecipientId?: string | null;
  required?: boolean;
  placeholder?: string;
  settings?: FieldPropertySettings;
  pageRect?: PageRect | DOMRect | null;
  hasError?: boolean;
}
