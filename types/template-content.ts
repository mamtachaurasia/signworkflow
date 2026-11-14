export const TEMPLATE_CONTENT_VERSION = 1 as const;

export type TemplateTextAlign = 'left' | 'center' | 'right';
export type TemplateContentBlockType = 'title' | 'heading' | 'paragraph' | 'list-item' | 'table' | 'page-break';

export interface TemplateTableContent {
  rows: string[][];
}

export interface TemplateContentBlock {
  id: string;
  type: TemplateContentBlockType;
  text: string;
  html?: string;
  table?: TemplateTableContent;
  align?: TemplateTextAlign;
  bold?: boolean;
  italic?: boolean;
}

export interface TemplateVariableDefinition {
  key: string;
  label: string;
  defaultValue?: string;
  required?: boolean;
}

export interface EditableTemplateContent {
  version: typeof TEMPLATE_CONTENT_VERSION;
  blocks: TemplateContentBlock[];
  variables: TemplateVariableDefinition[];
}
