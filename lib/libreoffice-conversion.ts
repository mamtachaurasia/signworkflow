import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { toPreparedPdfFileName, validatePdfUploadBuffer } from '@/lib/pdf-upload-validation';

const execFileAsync = promisify(execFile);

const CONVERTER_NOT_CONFIGURED_MESSAGE =
  'DOC and DOCX conversion is temporarily unavailable. Please try again later or upload a PDF.';

function getLibreOfficeCandidates(): string[] {
  return [
    process.env.LIBREOFFICE_BINARY,
    'soffice',
    'libreoffice',
    '/Applications/LibreOffice.app/Contents/MacOS/soffice',
    '/opt/homebrew/bin/soffice',
    '/usr/local/bin/soffice',
  ].filter((value): value is string => Boolean(value));
}

async function resolveLibreOfficeBinary(): Promise<string> {
  for (const candidate of getLibreOfficeCandidates()) {
    try {
      await execFileAsync(candidate, ['--version'], { timeout: 5000 });
      return candidate;
    } catch {
      // Try the next common binary name.
    }
  }

  throw new Error(CONVERTER_NOT_CONFIGURED_MESSAGE);
}

export async function convertWithLibreOffice(args: {
  inputBuffer: Buffer;
  safeInputFileName: string;
}): Promise<Buffer> {
  const binary = await resolveLibreOfficeBinary();
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'signworkflow-office-'));
  const inputPath = path.join(tempRoot, args.safeInputFileName);
  const outputDir = path.join(tempRoot, 'out');
  const profileDir = path.join(tempRoot, 'profile');
  const outputPath = path.join(outputDir, toPreparedPdfFileName(args.safeInputFileName));

  try {
    await writeFile(inputPath, args.inputBuffer);
    await mkdir(outputDir, { recursive: true });
    await mkdir(profileDir, { recursive: true });

    await execFileAsync(
      binary,
      [
        '--headless',
        '--nologo',
        '--nofirststartwizard',
        '--convert-to',
        'pdf',
        '--outdir',
        outputDir,
        `-env:UserInstallation=file://${profileDir}`,
        inputPath,
      ],
      {
        timeout: 60000,
        maxBuffer: 1024 * 1024 * 4,
      }
    );

    const pdfBuffer = await readFile(outputPath);
    const validationError = validatePdfUploadBuffer(pdfBuffer, 'pdf');
    if (validationError) {
      throw new Error('The converted document was not a valid PDF.');
    }

    return pdfBuffer;
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}
