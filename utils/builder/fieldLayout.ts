import { DroppedComponent, FieldPropertySettings } from '@/types/types';

export interface PageBounds {
  left: number;
  top: number;
  width: number;
  height: number;
  pageRect: DroppedComponent['pageRect'];
}

const AUTO_RESIZE_COMPONENTS = new Set([
  'Text',
  'Full Name',
  'Email',
  'Date',
  'Dropdown',
  'Radio',
  'Checkbox',
]);

const CHAR_WIDTH = 7.2;
const HORIZONTAL_PADDING = 18;
const VERTICAL_PADDING = 14;
const LINE_HEIGHT = 18;
const MAX_WIDTH = 900;
const MAX_HEIGHT = 420;

const clamp = (value: number, min: number, max: number) => {
  return Math.min(max, Math.max(min, value));
};

export const resolveAutoResizeDimensions = ({
  component,
  width,
  height,
  value,
  settings,
}: {
  component: string;
  width: number;
  height: number;
  value: string | null;
  settings: FieldPropertySettings | undefined;
}): Pick<DroppedComponent, 'width' | 'height'> => {
  if (settings?.readOnly === true || settings?.allowResize !== true) {
    return { width, height };
  }

  if (!AUTO_RESIZE_COMPONENTS.has(component)) {
    return { width, height };
  }

  const safeValue = String(value ?? '');
  const configuredOptions = Array.isArray(settings?.options)
    ? settings.options.map((option) => option.trim()).filter(Boolean)
    : [];

  let resizeText = safeValue;
  if (component === 'Date' && !resizeText.trim()) {
    resizeText = String(settings?.dateFormat || '').trim();
  }
  if (component === 'Dropdown' && !resizeText.trim()) {
    resizeText = configuredOptions.reduce(
      (longest, option) => (option.length > longest.length ? option : longest),
      ''
    );
  }
  if (component === 'Radio' && configuredOptions.length > 0) {
    resizeText = configuredOptions.join('\n');
  }
  if (component === 'Checkbox') {
    resizeText = String(settings?.label || '').trim() || safeValue;
  }

  const maxLines =
    typeof settings?.maxLines === 'number' && settings.maxLines > 0
      ? settings.maxLines
      : undefined;
  const lines = maxLines
    ? resizeText.split(/\r\n|\r|\n/).slice(0, maxLines)
    : resizeText.split(/\r\n|\r|\n/);

  const longestLineLength = Math.max(1, ...lines.map((line) => line.length));
  const estimatedWidth = Math.min(
    MAX_WIDTH,
    Math.max(width, Math.ceil(longestLineLength * CHAR_WIDTH + HORIZONTAL_PADDING))
  );
  const charsPerLine = Math.max(
    1,
    Math.floor((estimatedWidth - HORIZONTAL_PADDING) / CHAR_WIDTH)
  );
  const wrappedLineCount = Math.max(
    1,
    lines.reduce(
      (count, line) => count + Math.max(1, Math.ceil(Math.max(1, line.length) / charsPerLine)),
      0
    )
  );
  const estimatedHeight = Math.min(
    MAX_HEIGHT,
    Math.max(height, Math.ceil(wrappedLineCount * LINE_HEIGHT + VERTICAL_PADDING))
  );

  return { width: estimatedWidth, height: estimatedHeight };
};

export const estimateAutoFieldDimensions = (
  field: DroppedComponent,
  value: string | null
): Pick<DroppedComponent, 'width' | 'height'> =>
  resolveAutoResizeDimensions({
    component: field.component,
    width: field.width,
    height: field.height,
    value,
    settings: field.settings,
  });

export const fitFieldWithinPageBounds = (
  field: Pick<DroppedComponent, 'x' | 'y' | 'width' | 'height' | 'pageRect'>,
  pageBounds: PageBounds
): Pick<DroppedComponent, 'x' | 'y' | 'width' | 'height' | 'pageRect'> => {
  const minWidth = 24;
  const minHeight = 24;
  const nextWidth = Math.min(Math.max(minWidth, field.width), Math.max(minWidth, pageBounds.width));
  const nextHeight = Math.min(Math.max(minHeight, field.height), Math.max(minHeight, pageBounds.height));
  const maxX = pageBounds.left + pageBounds.width - nextWidth;
  const maxY = pageBounds.top + pageBounds.height - nextHeight;

  return {
    x: clamp(field.x, pageBounds.left, Math.max(pageBounds.left, maxX)),
    y: clamp(field.y, pageBounds.top, Math.max(pageBounds.top, maxY)),
    width: nextWidth,
    height: nextHeight,
    pageRect: pageBounds.pageRect ?? field.pageRect,
  };
};
