import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DOCUMENT_CONVERSION_UNAVAILABLE_MESSAGE,
  convertOfficeDocumentToPdf,
} from '@/lib/document-conversion';

const pdfBuffer = Buffer.from('%PDF-1.7\n%%EOF');

describe('document conversion', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.stubEnv('CLOUDMERSIVE_API_KEY', 'test-cloudmersive-key');
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('uses Cloudmersive for DOCX conversion when an API key is configured', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(pdfBuffer, {
        status: 200,
        headers: { 'content-type': 'application/pdf' },
      })
    );
    global.fetch = fetchMock;

    const result = await convertOfficeDocumentToPdf({
      inputBuffer: Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      originalFileName: 'contract.docx',
    });

    expect(result.equals(pdfBuffer)).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.cloudmersive.com/convert/docx/to/pdf',
      expect.objectContaining({
        method: 'POST',
        headers: { Apikey: 'test-cloudmersive-key' },
      })
    );
  });

  it('hides Cloudmersive quota and API details from users', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    global.fetch = vi.fn().mockResolvedValue(
      new Response('monthly quota exceeded', {
        status: 429,
        headers: { 'content-type': 'text/plain' },
      })
    );

    let caughtError: unknown;
    try {
      await convertOfficeDocumentToPdf({
        inputBuffer: Buffer.from([0x50, 0x4b, 0x03, 0x04]),
        originalFileName: 'quota.docx',
      });
    } catch (error) {
      caughtError = error;
    }

    expect(caughtError).toBeInstanceOf(Error);
    expect((caughtError as Error).message).toBe(DOCUMENT_CONVERSION_UNAVAILABLE_MESSAGE);
    expect((caughtError as Error).message).not.toMatch(/quota exceeded|429|Cloudmersive/i);
    expect(consoleError).toHaveBeenCalledWith(
      'Cloudmersive document conversion failed',
      expect.objectContaining({ status: 429 })
    );
  });
});
