const PDF_HEADER = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
const DOC_HEADER = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
const ZIP_HEADER = [0x50, 0x4b, 0x03, 0x04];

export const PDF_UPLOAD_ERROR_MESSAGE =
  'Only PDF, DOC, or DOCX files can be uploaded for signing.';

const PDF_MIME_TYPES = new Set([
  'application/pdf',
  'application/x-pdf',
]);

const DOC_MIME_TYPES = new Set([
  'application/msword',
  'application/vnd.ms-word',
]);

const DOCX_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/zip',
]);

const GENERIC_BINARY_MIME_TYPES = new Set([
  'application/octet-stream',
  'binary/octet-stream',
]);

type UploadFileMetadata = {
  name?: string;
  type?: string;
};

export type UploadSourceType = 'pdf' | 'doc' | 'docx';

function getExtension(fileName?: string): string {
  const normalized = typeof fileName === 'string' ? fileName.toLowerCase() : '';
  const dotIndex = normalized.lastIndexOf('.');
  return dotIndex >= 0 ? normalized.slice(dotIndex + 1) : '';
}

export function isPdfFileName(fileName?: string): boolean {
  return typeof fileName === 'string' && fileName.toLowerCase().endsWith('.pdf');
}

export function getUploadSourceType(fileName?: string): UploadSourceType | null {
  const extension = getExtension(fileName);
  if (extension === 'pdf') return 'pdf';
  if (extension === 'doc') return 'doc';
  if (extension === 'docx') return 'docx';
  return null;
}

export function isAllowedPdfMimeType(mimeType?: string): boolean {
  if (!mimeType) return true;
  return PDF_MIME_TYPES.has(mimeType.toLowerCase());
}

function isAllowedMimeType(sourceType: UploadSourceType, mimeType?: string): boolean {
  if (!mimeType) return true;
  const normalized = mimeType.split(';', 1)[0].trim().toLowerCase();

  // Browsers and cloud providers sometimes report otherwise-valid files as
  // generic binary. The extension is still required here and server routes
  // perform content validation before conversion or persistence.
  if (GENERIC_BINARY_MIME_TYPES.has(normalized)) return true;
  if (sourceType === 'pdf') return PDF_MIME_TYPES.has(normalized);
  if (sourceType === 'doc') return DOC_MIME_TYPES.has(normalized);
  return DOCX_MIME_TYPES.has(normalized);
}

export function validatePdfUploadMetadata(file: UploadFileMetadata): string | null {
  const sourceType = getUploadSourceType(file.name);
  if (!sourceType || !isAllowedMimeType(sourceType, file.type)) {
    return PDF_UPLOAD_ERROR_MESSAGE;
  }

  return null;
}

function toUint8Array(bytes: ArrayBuffer | ArrayBufferView): Uint8Array {
  return bytes instanceof ArrayBuffer
    ? new Uint8Array(bytes)
    : new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function hasHeader(bytes: ArrayBuffer | ArrayBufferView, header: number[]): boolean {
  const view = toUint8Array(bytes);
  if (view.length < header.length) return false;
  return header.every((byte, index) => view[index] === byte);
}

export function hasPdfHeader(bytes: ArrayBuffer | ArrayBufferView): boolean {
  return hasHeader(bytes, PDF_HEADER);
}

export function hasDocHeader(bytes: ArrayBuffer | ArrayBufferView): boolean {
  return hasHeader(bytes, DOC_HEADER);
}

export function hasDocxHeader(bytes: ArrayBuffer | ArrayBufferView): boolean {
  return hasHeader(bytes, ZIP_HEADER);
}

// This lightweight helper remains browser-compatible for existing callers.
// Upload routes handling Office files must additionally call the deep validator
// from office-upload-validation.server.ts before conversion.
export function validatePdfUploadBuffer(
  bytes: ArrayBuffer | ArrayBufferView,
  sourceType: UploadSourceType = 'pdf'
): string | null {
  if (sourceType === 'pdf') return hasPdfHeader(bytes) ? null : PDF_UPLOAD_ERROR_MESSAGE;
  if (sourceType === 'doc') return hasDocHeader(bytes) ? null : PDF_UPLOAD_ERROR_MESSAGE;
  return hasDocxHeader(bytes) ? null : PDF_UPLOAD_ERROR_MESSAGE;
}

export function toPreparedPdfFileName(fileName?: string): string {
  const safeName = (fileName || 'document')
    .replace(/[<>:"/\\|?*]+/g, '')
    .trim() || 'document';
  return safeName.replace(/\.(docx?|pdf)$/i, '') + '.pdf';
}

export function shouldConvertToPdf(sourceType: UploadSourceType): boolean {
  return sourceType === 'doc' || sourceType === 'docx';
}

export function getPdfBufferView(bytes: ArrayBuffer | ArrayBufferView): Uint8Array {
  return toUint8Array(bytes);
}
