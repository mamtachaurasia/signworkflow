import { inflateRawSync } from 'node:zlib';
import {
  PDF_UPLOAD_ERROR_MESSAGE,
  getPdfBufferView,
  hasDocHeader,
  hasDocxHeader,
  hasPdfHeader,
  type UploadSourceType,
} from '@/lib/pdf-upload-validation';

// Server-only deep validation for untrusted Office archive/container bytes.

const CFB_HEADER_BYTES = 512;
const CFB_DIRECTORY_ENTRY_BYTES = 128;
const CFB_BYTE_ORDER_LITTLE_ENDIAN = 0xfffe;
const CFB_V3_SECTOR_SHIFT = 9;
const CFB_V4_SECTOR_SHIFT = 12;
const CFB_MINI_SECTOR_SHIFT = 6;
const CFB_FREE_SECTOR = 0xffffffff;
const CFB_END_OF_CHAIN = 0xfffffffe;
const CFB_FAT_SECTOR = 0xfffffffd;
const CFB_DIFAT_SECTOR = 0xfffffffc;
const CFB_HEADER_DIFAT_ENTRIES = 109;
const ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const ZIP_CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const ZIP_LOCAL_FILE_SIGNATURE = 0x04034b50;
const ZIP_END_OF_CENTRAL_DIRECTORY_BYTES = 22;
const ZIP_MAX_COMMENT_BYTES = 0xffff;
const ZIP_MAX_CONTENT_TYPES_BYTES = 1024 * 1024;
const ZIP_MAX_DOCUMENT_XML_BYTES = 32 * 1024 * 1024;
const ZIP_MAX_ENTRY_UNCOMPRESSED_BYTES = 64 * 1024 * 1024;
const ZIP_MAX_TOTAL_UNCOMPRESSED_BYTES = 128 * 1024 * 1024;
const ZIP_MAX_ENTRY_COUNT = 4096;
const ZIP_MAX_COMPRESSION_RATIO = 200;
const ZIP_COMPRESSION_RATIO_FLOOR_BYTES = 1024 * 1024;
const DOCX_CONTENT_TYPES_ENTRY = '[Content_Types].xml';
const DOCX_DOCUMENT_ENTRY = 'word/document.xml';
const DOCX_MAIN_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml';

const toUint8Array = getPdfBufferView;

function readUint16LE(view: Uint8Array, offset: number): number | null {
  if (offset < 0 || offset + 2 > view.byteLength) return null;
  return view[offset] | (view[offset + 1] << 8);
}

function readUint32LE(view: Uint8Array, offset: number): number | null {
  if (offset < 0 || offset + 4 > view.byteLength) return null;
  return (
    view[offset]
    + view[offset + 1] * 0x100
    + view[offset + 2] * 0x10000
    + view[offset + 3] * 0x1000000
  ) >>> 0;
}

function decodeUtf8(view: Uint8Array): string {
  return Buffer.from(view.buffer, view.byteOffset, view.byteLength).toString('utf8');
}

function hasLegacyWordDocumentStream(bytes: ArrayBuffer | ArrayBufferView): boolean {
  const view = toUint8Array(bytes);
  if (!hasDocHeader(view) || view.byteLength < CFB_HEADER_BYTES * 2) {
    return false;
  }

  const majorVersion = readUint16LE(view, 26);
  const byteOrder = readUint16LE(view, 28);
  const sectorShift = readUint16LE(view, 30);
  const miniSectorShift = readUint16LE(view, 32);
  const hasValidSectorSize =
    (majorVersion === 3 && sectorShift === CFB_V3_SECTOR_SHIFT)
    || (majorVersion === 4 && sectorShift === CFB_V4_SECTOR_SHIFT);

  if (
    byteOrder !== CFB_BYTE_ORDER_LITTLE_ENDIAN
    || !hasValidSectorSize
    || miniSectorShift !== CFB_MINI_SECTOR_SHIFT
  ) {
    return false;
  }

  const sectorSize = 2 ** sectorShift;
  const sectorCount = Math.floor(view.byteLength / sectorSize) - 1;
  const fatSectorCount = readUint32LE(view, 44);
  const firstDirectorySector = readUint32LE(view, 48);
  const firstDifatSector = readUint32LE(view, 68);
  const difatSectorCount = readUint32LE(view, 72);
  if (
    sectorCount < 1
    || fatSectorCount === null
    || fatSectorCount < 1
    || fatSectorCount > sectorCount
    || firstDirectorySector === null
    || firstDirectorySector >= sectorCount
    || firstDifatSector === null
    || difatSectorCount === null
    || difatSectorCount > sectorCount
  ) {
    return false;
  }

  const sectorOffset = (sectorId: number) => (sectorId + 1) * sectorSize;
  const isRegularSector = (sectorId: number) => sectorId < sectorCount;
  const fatSectorIds: number[] = [];

  for (let index = 0; index < CFB_HEADER_DIFAT_ENTRIES; index += 1) {
    const sectorId = readUint32LE(view, 76 + index * 4);
    if (sectorId === null) return false;
    if (sectorId === CFB_FREE_SECTOR) continue;
    if (!isRegularSector(sectorId)) return false;
    fatSectorIds.push(sectorId);
  }

  const visitedDifatSectors = new Set<number>();
  let difatSectorId = firstDifatSector;
  const difatEntriesPerSector = sectorSize / 4 - 1;
  for (let index = 0; index < difatSectorCount; index += 1) {
    if (!isRegularSector(difatSectorId) || visitedDifatSectors.has(difatSectorId)) return false;
    visitedDifatSectors.add(difatSectorId);
    const offset = sectorOffset(difatSectorId);

    for (let entryIndex = 0; entryIndex < difatEntriesPerSector; entryIndex += 1) {
      const fatSectorId = readUint32LE(view, offset + entryIndex * 4);
      if (fatSectorId === null) return false;
      if (fatSectorId === CFB_FREE_SECTOR) continue;
      if (!isRegularSector(fatSectorId)) return false;
      fatSectorIds.push(fatSectorId);
    }

    const nextDifatSector = readUint32LE(view, offset + difatEntriesPerSector * 4);
    if (nextDifatSector === null) return false;
    difatSectorId = nextDifatSector;
  }

  if (
    fatSectorIds.length < fatSectorCount
    || (difatSectorCount === 0 && firstDifatSector !== CFB_END_OF_CHAIN)
    || (difatSectorCount > 0 && difatSectorId !== CFB_END_OF_CHAIN)
  ) {
    return false;
  }

  const fatEntries: number[] = [];
  for (const fatSectorId of fatSectorIds.slice(0, fatSectorCount)) {
    const offset = sectorOffset(fatSectorId);
    for (let entryOffset = 0; entryOffset < sectorSize; entryOffset += 4) {
      const value = readUint32LE(view, offset + entryOffset);
      if (value === null) return false;
      fatEntries.push(value);
    }
  }

  const visitedDirectorySectors = new Set<number>();
  let directorySectorId = firstDirectorySector;
  let foundRootEntry = false;
  let foundWordDocument = false;

  while (directorySectorId !== CFB_END_OF_CHAIN) {
    if (
      !isRegularSector(directorySectorId)
      || visitedDirectorySectors.has(directorySectorId)
      || visitedDirectorySectors.size >= sectorCount
    ) {
      return false;
    }
    visitedDirectorySectors.add(directorySectorId);
    const offset = sectorOffset(directorySectorId);

    for (let entryOffset = 0; entryOffset < sectorSize; entryOffset += CFB_DIRECTORY_ENTRY_BYTES) {
      const absoluteOffset = offset + entryOffset;
      const nameLength = readUint16LE(view, absoluteOffset + 64);
      const objectType = view[absoluteOffset + 66];
      if (
        nameLength === null
        || nameLength < 2
        || nameLength > 64
        || nameLength % 2 !== 0
        || (objectType !== 2 && objectType !== 5)
      ) {
        continue;
      }

      const name = Buffer.from(
        view.buffer,
        view.byteOffset + absoluteOffset,
        nameLength - 2
      ).toString('utf16le');
      if (objectType === 5 && name === 'Root Entry') foundRootEntry = true;
      if (objectType === 2 && name === 'WordDocument') foundWordDocument = true;
    }

    const nextDirectorySector = fatEntries[directorySectorId];
    if (
      nextDirectorySector === undefined
      || nextDirectorySector === CFB_FREE_SECTOR
      || nextDirectorySector === CFB_FAT_SECTOR
      || nextDirectorySector === CFB_DIFAT_SECTOR
    ) {
      return false;
    }
    directorySectorId = nextDirectorySector;
  }

  return foundRootEntry && foundWordDocument;
}

type ZipCentralEntry = {
  name: string;
  flags: number;
  compressionMethod: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
  archiveDataEnd: number;
};

function findZipEndOfCentralDirectory(view: Uint8Array): number {
  const firstPossibleOffset = Math.max(
    0,
    view.byteLength - ZIP_END_OF_CENTRAL_DIRECTORY_BYTES - ZIP_MAX_COMMENT_BYTES
  );

  for (
    let offset = view.byteLength - ZIP_END_OF_CENTRAL_DIRECTORY_BYTES;
    offset >= firstPossibleOffset;
    offset -= 1
  ) {
    if (readUint32LE(view, offset) !== ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE) continue;
    const commentLength = readUint16LE(view, offset + 20);
    if (commentLength !== null && offset + ZIP_END_OF_CENTRAL_DIRECTORY_BYTES + commentLength === view.byteLength) {
      return offset;
    }
  }

  return -1;
}

function readZipCentralEntries(view: Uint8Array): Map<string, ZipCentralEntry> | null {
  const endOffset = findZipEndOfCentralDirectory(view);
  if (endOffset < 0) return null;

  const diskNumber = readUint16LE(view, endOffset + 4);
  const centralDirectoryDisk = readUint16LE(view, endOffset + 6);
  const entriesOnDisk = readUint16LE(view, endOffset + 8);
  const entryCount = readUint16LE(view, endOffset + 10);
  const centralDirectorySize = readUint32LE(view, endOffset + 12);
  const centralDirectoryOffset = readUint32LE(view, endOffset + 16);

  if (
    diskNumber !== 0
    || centralDirectoryDisk !== 0
    || entriesOnDisk === null
    || entryCount === null
    || entriesOnDisk !== entryCount
    || entryCount === 0
    || entryCount === 0xffff
    || entryCount > ZIP_MAX_ENTRY_COUNT
    || centralDirectorySize === null
    || centralDirectoryOffset === null
    || centralDirectorySize === 0xffffffff
    || centralDirectoryOffset === 0xffffffff
    || centralDirectoryOffset + centralDirectorySize > endOffset
  ) {
    return null;
  }

  const entries = new Map<string, ZipCentralEntry>();
  let offset = centralDirectoryOffset;
  const expectedEnd = centralDirectoryOffset + centralDirectorySize;
  let totalUncompressedBytes = 0;

  for (let index = 0; index < entryCount; index += 1) {
    if (readUint32LE(view, offset) !== ZIP_CENTRAL_DIRECTORY_SIGNATURE) return null;

    const flags = readUint16LE(view, offset + 8);
    const compressionMethod = readUint16LE(view, offset + 10);
    const compressedSize = readUint32LE(view, offset + 20);
    const uncompressedSize = readUint32LE(view, offset + 24);
    const fileNameLength = readUint16LE(view, offset + 28);
    const extraLength = readUint16LE(view, offset + 30);
    const commentLength = readUint16LE(view, offset + 32);
    const diskStart = readUint16LE(view, offset + 34);
    const localHeaderOffset = readUint32LE(view, offset + 42);

    if (
      flags === null
      || compressionMethod === null
      || compressedSize === null
      || uncompressedSize === null
      || fileNameLength === null
      || extraLength === null
      || commentLength === null
      || diskStart !== 0
      || localHeaderOffset === null
      || compressedSize === 0xffffffff
      || uncompressedSize === 0xffffffff
      || localHeaderOffset === 0xffffffff
      || (flags & 0x1) !== 0
      || uncompressedSize > ZIP_MAX_ENTRY_UNCOMPRESSED_BYTES
      || (
        uncompressedSize > ZIP_COMPRESSION_RATIO_FLOOR_BYTES
        && (compressedSize === 0 || uncompressedSize > compressedSize * ZIP_MAX_COMPRESSION_RATIO)
      )
    ) {
      return null;
    }

    totalUncompressedBytes += uncompressedSize;
    if (totalUncompressedBytes > ZIP_MAX_TOTAL_UNCOMPRESSED_BYTES) return null;

    const nameStart = offset + 46;
    const nextOffset = nameStart + fileNameLength + extraLength + commentLength;
    if (nextOffset > expectedEnd) return null;

    const name = decodeUtf8(view.subarray(nameStart, nameStart + fileNameLength)).replaceAll('\\', '/');
    if (
      !name
      || name.includes('\0')
      || name.startsWith('/')
      || name.split('/').includes('..')
      || entries.has(name)
    ) {
      return null;
    }

    entries.set(name, {
      name,
      flags,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
      archiveDataEnd: centralDirectoryOffset,
    });
    offset = nextOffset;
  }

  return offset === expectedEnd ? entries : null;
}

function readZipEntry(
  view: Uint8Array,
  entry: ZipCentralEntry,
  maxOutputBytes: number
): Uint8Array | null {
  if (
    entry.uncompressedSize > maxOutputBytes
    || entry.localHeaderOffset + 30 > view.byteLength
    || readUint32LE(view, entry.localHeaderOffset) !== ZIP_LOCAL_FILE_SIGNATURE
  ) {
    return null;
  }

  const localFlags = readUint16LE(view, entry.localHeaderOffset + 6);
  const localCompressionMethod = readUint16LE(view, entry.localHeaderOffset + 8);
  const fileNameLength = readUint16LE(view, entry.localHeaderOffset + 26);
  const extraLength = readUint16LE(view, entry.localHeaderOffset + 28);
  if (
    localFlags === null
    || localCompressionMethod !== entry.compressionMethod
    || fileNameLength === null
    || extraLength === null
    || (localFlags & 0x1) !== 0
  ) {
    return null;
  }

  const nameStart = entry.localHeaderOffset + 30;
  const dataStart = nameStart + fileNameLength + extraLength;
  const dataEnd = dataStart + entry.compressedSize;
  if (dataEnd > entry.archiveDataEnd) return null;

  const localName = decodeUtf8(view.subarray(nameStart, nameStart + fileNameLength)).replaceAll('\\', '/');
  if (localName !== entry.name) return null;

  const compressed = view.subarray(dataStart, dataEnd);
  try {
    let output: Uint8Array;
    if (entry.compressionMethod === 0) {
      output = compressed;
    } else if (entry.compressionMethod === 8) {
      output = inflateRawSync(compressed, { maxOutputLength: maxOutputBytes });
    } else {
      return null;
    }

    return output.byteLength === entry.uncompressedSize ? output : null;
  } catch {
    return null;
  }
}

function contentTypesDeclareWordDocument(xml: string): boolean {
  if (!/<(?:[A-Za-z_][\w.-]*:)?Types\b/i.test(xml)) return false;

  const overrides = xml.match(/<(?:[A-Za-z_][\w.-]*:)?Override\b[^>]*>/gi) || [];
  return overrides.some((element) => {
    const partName = element.match(/\bPartName\s*=\s*["']([^"']+)["']/i)?.[1];
    const contentType = element.match(/\bContentType\s*=\s*["']([^"']+)["']/i)?.[1];
    return partName === '/word/document.xml' && contentType === DOCX_MAIN_CONTENT_TYPE;
  });
}

function isWordDocumentXml(xml: string): boolean {
  return (
    /<(?:[A-Za-z_][\w.-]*:)?document\b/i.test(xml)
    && /(?:http:\/\/schemas\.openxmlformats\.org\/wordprocessingml\/2006\/main|http:\/\/purl\.oclc\.org\/ooxml\/wordprocessingml\/main)/i.test(xml)
  );
}

export function hasDocxPackageStructure(bytes: ArrayBuffer | ArrayBufferView): boolean {
  const view = toUint8Array(bytes);
  if (!hasDocxHeader(view)) return false;

  const entries = readZipCentralEntries(view);
  const contentTypesEntry = entries?.get(DOCX_CONTENT_TYPES_ENTRY);
  const documentEntry = entries?.get(DOCX_DOCUMENT_ENTRY);
  if (!contentTypesEntry || !documentEntry || documentEntry.uncompressedSize === 0) return false;

  const contentTypesBytes = readZipEntry(view, contentTypesEntry, ZIP_MAX_CONTENT_TYPES_BYTES);
  const documentBytes = readZipEntry(view, documentEntry, ZIP_MAX_DOCUMENT_XML_BYTES);
  if (!contentTypesBytes || !documentBytes) return false;

  return (
    contentTypesDeclareWordDocument(decodeUtf8(contentTypesBytes))
    && isWordDocumentXml(decodeUtf8(documentBytes))
  );
}

export function validateOfficeUploadBuffer(
  bytes: ArrayBuffer | ArrayBufferView,
  sourceType: UploadSourceType = 'pdf'
): string | null {
  if (sourceType === 'pdf') return hasPdfHeader(bytes) ? null : PDF_UPLOAD_ERROR_MESSAGE;
  if (sourceType === 'doc') {
    return hasLegacyWordDocumentStream(bytes) ? null : PDF_UPLOAD_ERROR_MESSAGE;
  }
  return hasDocxPackageStructure(bytes) ? null : PDF_UPLOAD_ERROR_MESSAGE;
}
