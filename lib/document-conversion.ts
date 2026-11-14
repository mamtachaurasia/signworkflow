import path from 'node:path';

import {
  getUploadSourceType,
  validatePdfUploadBuffer,
} from '@/lib/pdf-upload-validation';

export const DOCUMENT_CONVERSION_UNAVAILABLE_MESSAGE =
  'Word document conversion is temporarily unavailable. Please upload a PDF version of this document.';
const CONVERTER_NOT_CONFIGURED_MESSAGE = DOCUMENT_CONVERSION_UNAVAILABLE_MESSAGE;
const CLOUDMERSIVE_BASE_URL = 'https://api.cloudmersive.com';

function getCloudmersiveApiKey(): string | null {
  return process.env.CLOUDMERSIVE_API_KEY || process.env.cloudmersive || null;
}

function getCloudmersiveEndpoint(fileName: string): string | null {
  const sourceType = getUploadSourceType(fileName);
  if (sourceType === 'doc') return `${CLOUDMERSIVE_BASE_URL}/convert/doc/to/pdf`;
  if (sourceType === 'docx') return `${CLOUDMERSIVE_BASE_URL}/convert/docx/to/pdf`;
  return null;
}

async function convertWithCloudmersive(args: {
  inputBuffer: Buffer;
  safeInputFileName: string;
}): Promise<Buffer> {
  try {
    const apiKey = getCloudmersiveApiKey();
    const endpoint = getCloudmersiveEndpoint(args.safeInputFileName);
    if (!apiKey || !endpoint) {
      throw new Error(CONVERTER_NOT_CONFIGURED_MESSAGE);
    }

    const formData = new FormData();
    formData.append(
      'inputFile',
      new Blob([new Uint8Array(args.inputBuffer)]),
      args.safeInputFileName
    );

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Apikey: apiKey,
      },
      body: formData,
    });

    if (!response.ok) {
      const details = await response.text().catch(() => '');
      console.error('Cloudmersive document conversion failed', {
        status: response.status,
        details: details.slice(0, 1000),
      });
      throw new Error(CONVERTER_NOT_CONFIGURED_MESSAGE);
    }

    const pdfBuffer = Buffer.from(await response.arrayBuffer());
    const validationError = validatePdfUploadBuffer(pdfBuffer, 'pdf');
    if (validationError) {
      console.error('Cloudmersive document conversion returned a non-PDF response');
      throw new Error(CONVERTER_NOT_CONFIGURED_MESSAGE);
    }

    return pdfBuffer;
  } catch (error) {
    if (error instanceof Error && error.message === CONVERTER_NOT_CONFIGURED_MESSAGE) {
      throw error;
    }

    console.error('Cloudmersive document conversion request failed', error);
    throw new Error(CONVERTER_NOT_CONFIGURED_MESSAGE);
  }
}

export async function convertOfficeDocumentToPdf(args: {
  inputBuffer: Buffer;
  originalFileName: string;
}): Promise<Buffer> {
  const safeInputFileName = path.basename(args.originalFileName).replace(/[<>:"/\\|?*]+/g, '').trim() || 'document.docx';

  try {
    if (getCloudmersiveApiKey()) {
      return await convertWithCloudmersive({
        inputBuffer: args.inputBuffer,
        safeInputFileName,
      });
    }

    const { convertWithLibreOffice } = await import('@/lib/libreoffice-conversion');
    return await convertWithLibreOffice({
      inputBuffer: args.inputBuffer,
      safeInputFileName,
    });
  } catch (error) {
    if (error instanceof Error && error.message === CONVERTER_NOT_CONFIGURED_MESSAGE) {
      throw error;
    }

    throw new Error(
      error instanceof Error && error.message
        ? `Failed to convert Word document to PDF. ${error.message}`
        : 'Failed to convert Word document to PDF.'
    );
  }
}
