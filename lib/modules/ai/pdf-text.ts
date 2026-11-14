import { initializePdfWorker } from '@/utils/pdfjsSetup';
import { join } from 'path';

interface PromiseConstructorWithResolvers extends PromiseConstructor {
  withResolvers<T>(): {
    promise: Promise<T>;
    resolve: (value: T | PromiseLike<T>) => void;
    reject: (reason?: unknown) => void;
  };
}

// Polyfill for Promise.withResolvers for older Node.js versions
const promiseConstructor = Promise as unknown as PromiseConstructorWithResolvers;
if (!promiseConstructor.withResolvers) {
  promiseConstructor.withResolvers = function <T>(): {
    promise: Promise<T>;
    resolve: (value: T | PromiseLike<T>) => void;
    reject: (reason?: unknown) => void;
  } {
    let resolve: (value: T | PromiseLike<T>) => void;
    let reject: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve: resolve!, reject: reject! };
  };
}

// Set up polyfills before importing pdfjs
function ensurePdfJsNodePolyfills(): void {
  if (typeof globalThis.DOMMatrix !== 'undefined') {
    return;
  }

  class NodeDOMMatrix {
    a = 1;
    b = 0;
    c = 0;
    d = 1;
    e = 0;
    f = 0;

    constructor(init?: number[] | string) {
      if (Array.isArray(init) && init.length >= 6) {
        [this.a, this.b, this.c, this.d, this.e, this.f] = init;
      }
    }

    multiplySelf() {
      return this;
    }

    preMultiplySelf() {
      return this;
    }

    translate() {
      return this;
    }

    scale() {
      return this;
    }

    invertSelf() {
      return this;
    }
  }

  globalThis.DOMMatrix = NodeDOMMatrix as unknown as typeof DOMMatrix;
}

// Call polyfill setup at module load time
ensurePdfJsNodePolyfills();

type PdfTextItem = {
  str?: string;
};

type PdfPage = {
  getTextContent: () => Promise<{ items: PdfTextItem[] }>;
};

type PdfDocument = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfPage>;
};

type PdfJsModule = {
  version: string;
  GlobalWorkerOptions: {
    workerSrc: string;
  };
  getDocument: (options: {
    data: Uint8Array;
    standardFontDataUrl?: string;
  }) => {
    promise: Promise<PdfDocument>;
  };
};

export async function extractTextFromPDF(pdfBuffer: Buffer): Promise<string> {
  try {
    // pdfjs-dist doesn't have complete type definitions for this build
    const pdfjsModule = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as PdfJsModule;

    // Initialize worker using the centralized setup
    initializePdfWorker(pdfjsModule);

    // Get path to standard fonts - use file:// URL for Node.js
    const fontDirPath = `file://${join(process.cwd(), 'node_modules/pdfjs-dist/standard_fonts')}/`;

    const pdf = await pdfjsModule.getDocument({
      data: new Uint8Array(pdfBuffer),
      standardFontDataUrl: fontDirPath,
    }).promise;

    let fullText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
      try {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item: PdfTextItem) => item.str || '')
          .join(' ');
        fullText += `${pageText}\n`;
      } catch (pageError) {
        console.warn(`Failed to extract text from page ${i}:`, pageError);
        continue;
      }
    }

    return fullText.trim() || 'Unable to extract text from PDF';
  } catch (error) {
    console.error('PDF extraction error:', error);
    throw new Error(`Failed to extract text from PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
