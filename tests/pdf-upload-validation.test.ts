import { describe, expect, it } from 'vitest';
import {
  PDF_UPLOAD_ERROR_MESSAGE,
  getUploadSourceType,
  hasDocHeader,
  hasDocxHeader,
  hasPdfHeader,
  shouldConvertToPdf,
  toPreparedPdfFileName,
  validatePdfUploadMetadata,
} from '@/lib/pdf-upload-validation';
import {
  hasDocxPackageStructure,
  validateOfficeUploadBuffer,
} from '@/lib/office-upload-validation.server';
import {
  createDocxBytes,
  createLegacyDocBytes,
  createSpreadsheetZipBytes,
  createStoredZip,
  withDeclaredZipEntrySize,
} from './helpers/office-upload-fixtures';

describe('PDF upload validation', () => {
  it('accepts PDF file metadata and bytes', () => {
    expect(validatePdfUploadMetadata({ name: 'contract.pdf', type: 'application/pdf' })).toBeNull();
    expect(getUploadSourceType('contract.pdf')).toBe('pdf');
    expect(hasPdfHeader(Buffer.from('%PDF-1.7\n'))).toBe(true);
    expect(validateOfficeUploadBuffer(Buffer.from('%PDF-1.7\n'))).toBeNull();
  });

  it('accepts Word file metadata and marks it for conversion', () => {
    expect(validatePdfUploadMetadata({ name: 'contract.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }))
      .toBeNull();
    expect(validatePdfUploadMetadata({ name: 'legacy.doc', type: 'application/msword' })).toBeNull();
    expect(getUploadSourceType('contract.docx')).toBe('docx');
    expect(getUploadSourceType('legacy.doc')).toBe('doc');
    expect(shouldConvertToPdf('docx')).toBe(true);
    expect(shouldConvertToPdf('doc')).toBe(true);
    expect(toPreparedPdfFileName('contract.docx')).toBe('contract.pdf');
  });

  it('accepts generic binary MIME metadata only when the extension is supported', () => {
    expect(validatePdfUploadMetadata({ name: 'contract.pdf', type: 'application/octet-stream' }))
      .toBeNull();
    expect(validatePdfUploadMetadata({ name: 'legacy.doc', type: 'application/octet-stream' }))
      .toBeNull();
    expect(validatePdfUploadMetadata({ name: 'contract.docx', type: 'application/octet-stream' }))
      .toBeNull();
    expect(validatePdfUploadMetadata({ name: 'workbook.xlsx', type: 'application/octet-stream' }))
      .toBe(PDF_UPLOAD_ERROR_MESSAGE);
  });

  it('validates a DOCX package instead of trusting the ZIP signature', () => {
    const docx = createDocxBytes();

    expect(hasDocxHeader(docx)).toBe(true);
    expect(hasDocxPackageStructure(docx)).toBe(true);
    expect(validateOfficeUploadBuffer(docx, 'docx')).toBeNull();
    expect(validateOfficeUploadBuffer(createStoredZip({ 'notes.txt': 'not Word' }), 'docx'))
      .toBe(PDF_UPLOAD_ERROR_MESSAGE);
  });

  it('validates deflated DOCX package metadata and document XML', () => {
    expect(validateOfficeUploadBuffer(createDocxBytes({ deflated: true }), 'docx')).toBeNull();
  });

  it('rejects XLSX packages and spoofed Word paths renamed to DOCX', () => {
    expect(validateOfficeUploadBuffer(createSpreadsheetZipBytes(), 'docx'))
      .toBe(PDF_UPLOAD_ERROR_MESSAGE);
    expect(validateOfficeUploadBuffer(
      createSpreadsheetZipBytes({ includeFakeWordEntry: true }),
      'docx'
    )).toBe(PDF_UPLOAD_ERROR_MESSAGE);
  });

  it('rejects DOCX packages with ZIP-bomb size metadata', () => {
    const bomb = withDeclaredZipEntrySize(
      createDocxBytes(),
      'word/document.xml',
      512 * 1024 * 1024
    );

    expect(validateOfficeUploadBuffer(bomb, 'docx')).toBe(PDF_UPLOAD_ERROR_MESSAGE);
  });

  it('requires the WordDocument stream for legacy CFB uploads', () => {
    expect(validateOfficeUploadBuffer(createLegacyDocBytes(), 'doc')).toBeNull();
    expect(validateOfficeUploadBuffer(createLegacyDocBytes('Workbook'), 'doc'))
      .toBe(PDF_UPLOAD_ERROR_MESSAGE);
  });

  it('rejects unsupported upload types', () => {
    expect(validatePdfUploadMetadata({ name: 'notes.txt', type: 'text/plain' })).toBe(PDF_UPLOAD_ERROR_MESSAGE);
  });

  it('rejects renamed non-PDF and malformed Word content', () => {
    expect(validatePdfUploadMetadata({ name: 'renamed.pdf', type: 'application/pdf' })).toBeNull();
    expect(validateOfficeUploadBuffer(Buffer.from('not a pdf'))).toBe(PDF_UPLOAD_ERROR_MESSAGE);
    expect(hasDocHeader(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))).toBe(true);
    expect(hasDocxHeader(Buffer.from([0x50, 0x4b, 0x03, 0x04]))).toBe(true);
    expect(validateOfficeUploadBuffer(Buffer.from('not a doc'), 'doc')).toBe(PDF_UPLOAD_ERROR_MESSAGE);
    expect(validateOfficeUploadBuffer(Buffer.from('not a docx'), 'docx')).toBe(PDF_UPLOAD_ERROR_MESSAGE);
  });
});
