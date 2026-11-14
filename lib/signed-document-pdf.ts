import { Readable } from 'stream';

import { degrees, PDFDocument, PDFFont, rgb, StandardFonts } from 'pdf-lib';
import type { HydratedDocument } from 'mongoose';

import { type IDocument, type IDocumentRecipient } from '@/models/Document';
import SignatureModel from '@/models/Signature';
import type { DocumentField } from '@/types/types';
import { getObjectStream, normalizeStorageProvider } from '@/lib/s3';
import { getUserSettingsByUserId } from '@/lib/user-settings-server';
import { DEFAULT_USER_SETTINGS } from '@/lib/user-settings';

type FieldValueRecord = {
  fieldId?: string;
  version?: number;
  signedAt?: Date | string;
  fieldValue?: string;
};

type SerializedBuffer = {
  buffer?: Buffer;
  type?: 'Buffer' | string;
  data?: number[];
};

type DocumentFieldWithLegacyId = DocumentField & { fieldId?: string };

type VersionWithLabel = {
  version?: number;
  label?: string;
  pdfData?: Buffer | SerializedBuffer | null;
  storage?: {
    provider?: string;
    bucket?: string;
    key?: string;
    region?: string;
  };
  fields?: DocumentField[];
};

function wrapText(text: string, font: PDFFont, fontSize: number, maxWidth: number): string[] {
  const lines: string[] = [];

  text.split('\n').forEach((paragraph) => {
    let line = '';
    paragraph.split(' ').forEach((word) => {
      const testLine = line ? `${line} ${word}` : word;
      const width = font.widthOfTextAtSize(testLine, fontSize);
      if (width > maxWidth) {
        if (line) lines.push(line);
        line = word;
      } else {
        line = testLine;
      }
    });
    if (line) lines.push(line);
  });

  return lines;
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function resolvePdfBuffer(version: VersionWithLabel): Promise<Buffer | null> {
  if (version.pdfData) {
    if (Buffer.isBuffer(version.pdfData)) {
      return version.pdfData;
    }
    if ((version.pdfData as SerializedBuffer).buffer) {
      return Buffer.from((version.pdfData as SerializedBuffer).buffer as Buffer);
    }
    if (
      typeof version.pdfData === 'object' &&
      (version.pdfData as SerializedBuffer).type === 'Buffer' &&
      Array.isArray((version.pdfData as SerializedBuffer).data)
    ) {
      return Buffer.from((version.pdfData as SerializedBuffer).data as number[]);
    }
    throw new Error('Invalid PDF data format');
  }

  if (version.storage?.provider && version.storage.bucket && version.storage.key) {
    const storageProvider = normalizeStorageProvider(version.storage.provider);
    const stream = await getObjectStream({
      bucket: version.storage.bucket,
      key: version.storage.key,
      region: version.storage.region,
      provider: storageProvider,
    });
    return streamToBuffer(stream);
  }

  return null;
}

export async function buildSignedDocumentPdf(args: {
  document: HydratedDocument<IDocument>;
  requesterUserId: string;
}): Promise<{ buffer: Buffer; fileName: string }> {
  const { document, requesterUserId } = args;
  const userSettings = await getUserSettingsByUserId(String(requesterUserId));
  const settingsLocale = userSettings.locale || DEFAULT_USER_SETTINGS.locale;
  const settingsTimeZone = userSettings.timeZone || DEFAULT_USER_SETTINGS.timeZone;
  const settingsHour12 = userSettings.timeFormat !== '24h';
  const formatDateTime = (value?: Date | string | null) => {
    if (!value) return 'N/A';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat(settingsLocale, {
      dateStyle: 'medium',
      timeStyle: 'short',
      hour12: settingsHour12,
      timeZone: settingsTimeZone,
    }).format(date);
  };

  if (document.status !== 'signed' && document.status !== 'completed') {
    throw new Error('Document is not completed yet');
  }

  const versions = (document.versions || []) as VersionWithLabel[];
  const versionByNumber = versions.find((currentVersion) => currentVersion.version === document.currentVersion);
  const signedVersions = versions.filter(
    (currentVersion) => typeof currentVersion?.label === 'string' && currentVersion.label.startsWith('signed')
  );
  signedVersions.sort((left, right) => (right.version ?? 0) - (left.version ?? 0));
  const latestSignedVersion = signedVersions[0];
  const version = versionByNumber || latestSignedVersion || versions[versions.length - 1];
  if (!version) {
    throw new Error('Version not found');
  }

  const pdfBuffer = await resolvePdfBuffer(version);
  if (!pdfBuffer) {
    throw new Error('PDF data not available');
  }

  const pdfDoc = await PDFDocument.load(new Uint8Array(pdfBuffer));
  const pages = pdfDoc.getPages();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const preparedVersions = versions.filter((currentVersion) => currentVersion?.label === 'prepared');
  preparedVersions.sort((left, right) => (right?.version || 0) - (left?.version || 0));
  const preparedVersion = preparedVersions[0];
  const rawFields = Array.isArray(preparedVersion?.fields)
    ? (preparedVersion.fields as DocumentField[])
    : Array.isArray(version.fields)
      ? (version.fields as DocumentField[])
      : [];

  const signedFieldRecords = await SignatureModel.find({ documentId: document._id }).lean();
  const fieldValueMap = new Map<string, { value: string; version: number; signedAt: number }>();
  for (const record of signedFieldRecords) {
    const typedRecord = record as FieldValueRecord;
    const fieldId = String(typedRecord.fieldId ?? '');
    if (!fieldId) continue;
    const signedVersion = typeof typedRecord.version === 'number' ? typedRecord.version : -1;
    const signedAt = typedRecord.signedAt ? new Date(typedRecord.signedAt).getTime() : 0;
    const existing = fieldValueMap.get(fieldId);
    if (!existing || signedVersion > existing.version || (signedVersion === existing.version && signedAt > existing.signedAt)) {
      fieldValueMap.set(fieldId, {
        value: String(typedRecord.fieldValue ?? ''),
        version: signedVersion,
        signedAt,
      });
    }
  }

  const fields = rawFields.map((field) => {
    const maybeField = field as DocumentFieldWithLegacyId & { toObject?: () => DocumentFieldWithLegacyId };
    const plain = typeof maybeField.toObject === 'function' ? maybeField.toObject() : { ...field };
    const fieldId = String(plain.id ?? plain.fieldId ?? '');
    if (!fieldId) return plain as DocumentFieldWithLegacyId;
    const signedValue = fieldValueMap.get(fieldId);
    if (!signedValue) return plain as DocumentFieldWithLegacyId;
    return { ...plain, value: signedValue.value };
  });

  for (const field of fields) {
    if (!field.pageNumber || !field) continue;

    const page = pages[field.pageNumber - 1];
    const { width: pageWidth, height: pageHeight } = page.getSize();
    const rotation = page.getRotation().angle;

    let scaleX = 1;
    let scaleY = 1;
    let relativeX = field.x;
    let relativeY = field.y;
    if (field.pageRect?.width && field.pageRect?.height) {
      scaleX = pageWidth / field.pageRect.width;
      scaleY = pageHeight / field.pageRect.height;
      if (typeof field.pageRect.left === 'number' && typeof field.pageRect.top === 'number') {
        const candidateX = field.x - field.pageRect.left;
        const candidateY = field.y - field.pageRect.top;
        const withinX = candidateX >= -1 && candidateX <= field.pageRect.width + 1;
        const withinY = candidateY >= -1 && candidateY <= field.pageRect.height + 1;
        if (withinX && withinY) {
          relativeX = candidateX;
          relativeY = candidateY;
        }
      }
    }

    const adjustedX = relativeX * scaleX;
    const adjustedY = pageHeight - (relativeY + field.height) * scaleY;
    const scaledW = field.width * scaleX;
    const scaledH = field.height * scaleY;
    const x = Math.max(0, Math.min(adjustedX, pageWidth - scaledW));
    const y = Math.max(0, Math.min(adjustedY, pageHeight - scaledH));

    if (field.type === 'text' || field.type === 'full_name' || field.type === 'date' || field.type === 'dropdown' || field.type === 'radio') {
      if (!field.value) continue;

      const fontSize = Math.min(12 * scaleY, scaledH * 0.8);
      const lineHeight = fontSize * 1.2;
      const lines = wrapText(String(field.value), font, fontSize, scaledW);

      let cursorY = y + scaledH - lineHeight;
      for (const line of lines) {
        if (cursorY < y) break;
        page.drawText(line, {
          x,
          y: cursorY,
          size: fontSize,
          font,
          ...(rotation ? { rotate: degrees(rotation) } : {}),
        });
        cursorY -= lineHeight;
      }
    }

    if (['signature', 'initials', 'image', 'stamp', 'live_photo'].includes(field.type)) {
      if (!field.value?.startsWith('data:image')) continue;

      const base64 = field.value.split(',')[1];
      const bytes = Buffer.from(base64, 'base64');

      let image;
      try {
        image = field.value.includes('png') ? await pdfDoc.embedPng(bytes) : await pdfDoc.embedJpg(bytes);
      } catch {
        continue;
      }

      page.drawImage(image, {
        x,
        y,
        width: scaledW,
        height: scaledH,
        ...(rotation ? { rotate: degrees(rotation) } : {}),
      });
    }

    if (field.type === 'checkbox' && field.value === 'true') {
      const size = Math.min(scaledW, scaledH) * 0.8;
      page.drawText('X', {
        x: x + scaledW / 4,
        y: y + scaledH / 6,
        size,
        font: boldFont,
        color: rgb(0, 0.5, 0),
      });
    }

    page.drawText(`Signed ${formatDateTime(new Date())}`, {
      x: adjustedX,
      y: adjustedY - 20 * Math.min(scaleX, scaleY),
      size: 10,
      color: rgb(0.074, 0.545, 0.262),
      ...(rotation ? { rotate: degrees(rotation) } : {}),
    });
  }

  if (userSettings.watermarkDownloads) {
    const watermarkText = 'Contract eSign';
    for (const page of pdfDoc.getPages()) {
      const { width, height } = page.getSize();
      page.drawText(watermarkText, {
        x: width * 0.15,
        y: height * 0.45,
        size: 48,
        font: boldFont,
        color: rgb(0.85, 0.88, 0.92),
        rotate: degrees(-25),
      });
    }
  }

  const includeCertificate = userSettings.attachCertificate;
  const includeAuditTrail = userSettings.attachAuditTrail;
  if (includeCertificate || includeAuditTrail) {
    const metadataPage = pdfDoc.addPage();
    const { height } = metadataPage.getSize();
    let yPosition = height - 50;

    if (includeCertificate) {
      metadataPage.drawText('Certificate of Completion', {
        x: 50,
        y: yPosition,
        size: 20,
        font: boldFont,
        color: rgb(0, 0.2, 0.5),
      });
      yPosition -= 40;

      metadataPage.drawText(`Document: ${document.documentName}`, {
        x: 50,
        y: yPosition,
        size: 12,
        font,
      });
      yPosition -= 20;

      metadataPage.drawText('Status: Signed', {
        x: 50,
        y: yPosition,
        size: 12,
        font,
        color: rgb(0, 0.5, 0),
      });
      yPosition -= 20;

      metadataPage.drawText(`Completed: ${formatDateTime(document.completedAt || new Date())}`, {
        x: 50,
        y: yPosition,
        size: 12,
        font,
      });
      yPosition -= 20;

      if (userSettings.displayEsignId) {
        metadataPage.drawText('Verified by Contract eSign', {
          x: 50,
          y: yPosition,
          size: 10,
          font,
          color: rgb(0.4, 0.4, 0.4),
        });
        yPosition -= 20;
      }

      const fieldTypeCounts = rawFields.reduce((acc: Record<string, number>, field) => {
        acc[field.type] = (acc[field.type] || 0) + 1;
        return acc;
      }, {});

      const fieldSummary = Object.entries(fieldTypeCounts)
        .map(([type, count]) => `${count} ${type}${count > 1 ? 's' : ''}`)
        .join(', ') || 'N/A';

      metadataPage.drawText(`Fields: ${fieldSummary}`, {
        x: 50,
        y: yPosition,
        size: 10,
        font,
        color: rgb(0.4, 0.4, 0.4),
      });
      yPosition -= 40;
    }

    if (includeAuditTrail) {
      metadataPage.drawText('Audit Trail', {
        x: 50,
        y: yPosition,
        size: 16,
        font: boldFont,
      });
      yPosition -= 30;

      const recipients = (document.recipients as IDocumentRecipient[]) || [];
      for (const recipient of recipients) {
        if (yPosition < 100) {
          break;
        }

        metadataPage.drawText('_'.repeat(80), {
          x: 50,
          y: yPosition,
          size: 10,
          font,
          color: rgb(0.7, 0.7, 0.7),
        });
        yPosition -= 20;

        metadataPage.drawText(`Name: ${recipient.name}`, {
          x: 50,
          y: yPosition,
          size: 11,
          font: boldFont,
        });
        yPosition -= 18;

        metadataPage.drawText(`Email: ${recipient.email}`, {
          x: 50,
          y: yPosition,
          size: 10,
          font,
        });
        yPosition -= 18;

        metadataPage.drawText(`Role: ${recipient.role}`, {
          x: 50,
          y: yPosition,
          size: 10,
          font,
        });
        yPosition -= 18;

        metadataPage.drawText(`Status: ${recipient.status}`, {
          x: 50,
          y: yPosition,
          size: 10,
          font,
          color: recipient.status === 'signed' ? rgb(0, 0.5, 0) : rgb(0.5, 0.5, 0.5),
        });
        yPosition -= 18;

        if (recipient.signedAt) {
          metadataPage.drawText(`Signed At: ${formatDateTime(recipient.signedAt)}`, {
            x: 50,
            y: yPosition,
            size: 10,
            font,
          });
          yPosition -= 18;
        }

        const recipientIp = (recipient as IDocumentRecipient & { ipAddress?: string }).ipAddress;
        if (recipientIp) {
          metadataPage.drawText(`IP Address: ${recipientIp}`, {
            x: 50,
            y: yPosition,
            size: 10,
            font,
            color: rgb(0.5, 0.5, 0.5),
          });
          yPosition -= 18;
        }

        yPosition -= 10;
      }
    }

    metadataPage.drawText('This document has been electronically signed and is legally binding.', {
      x: 50,
      y: 30,
      size: 8,
      font,
      color: rgb(0.5, 0.5, 0.5),
    });
  }

  const pdfBytes = await pdfDoc.save();
  return {
    buffer: Buffer.from(pdfBytes),
    fileName: `${document.documentName}-signed.pdf`,
  };
}
