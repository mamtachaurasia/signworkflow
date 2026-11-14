import { NextResponse } from 'next/server';
import { PDFDocument } from 'pdf-lib';

import { allowInternalE2ERoutes } from '@/lib/e2e-env';

export async function GET() {
  if (!allowInternalE2ERoutes()) {
    return new NextResponse('Not Found', { status: 404 });
  }

  const pdfDoc = await PDFDocument.create();
  pdfDoc.addPage([612, 792]);
  const pdfBytes = await pdfDoc.save();

  return new NextResponse(new Uint8Array(pdfBytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Cache-Control': 'no-store',
    },
  });
}
