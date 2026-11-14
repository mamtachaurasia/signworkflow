import { Readable } from 'stream';
import { describe, expect, it, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';

import { mergeFieldsIntoPdfServer } from '@/lib/pdf';
import type { DocumentField } from '@/types/types';

async function createPdfStream() {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.addPage([300, 300]);
  const bytes = await pdfDoc.save();
  return Readable.from([Buffer.from(bytes)]);
}

describe('mergeFieldsIntoPdfServer', () => {
  it('renders checked checkbox fields without logging font encoding errors', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const pdfStream = await createPdfStream();
    const fields: DocumentField[] = [
      {
        id: 'checkbox-1',
        type: 'checkbox',
        x: 40,
        y: 40,
        width: 24,
        height: 24,
        pageNumber: 1,
        required: false,
        value: 'true',
      },
    ];

    const mergedPdf = await mergeFieldsIntoPdfServer(pdfStream, fields);

    expect(mergedPdf).toBeInstanceOf(Buffer);
    expect(mergedPdf.length).toBeGreaterThan(0);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });
});
