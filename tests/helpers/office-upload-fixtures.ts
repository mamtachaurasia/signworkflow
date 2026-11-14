const WORD_MAIN_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml';
const SPREADSHEET_MAIN_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml';

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createZip(
  entries: Record<string, string | Uint8Array>,
  compressionMethod: 0 | 8
): Buffer {
  const localRecords: Buffer[] = [];
  const centralRecords: Buffer[] = [];
  let localOffset = 0;

  for (const [name, rawValue] of Object.entries(entries)) {
    const nameBytes = Buffer.from(name, 'utf8');
    const value = typeof rawValue === 'string' ? Buffer.from(rawValue, 'utf8') : Buffer.from(rawValue);
    const compressedValue = compressionMethod === 8 ? deflateRawSync(value) : value;
    const checksum = crc32(value);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(compressionMethod, 8);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(compressedValue.byteLength, 18);
    localHeader.writeUInt32LE(value.byteLength, 22);
    localHeader.writeUInt16LE(nameBytes.byteLength, 26);
    const localRecord = Buffer.concat([localHeader, nameBytes, compressedValue]);
    localRecords.push(localRecord);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(compressionMethod, 10);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(compressedValue.byteLength, 20);
    centralHeader.writeUInt32LE(value.byteLength, 24);
    centralHeader.writeUInt16LE(nameBytes.byteLength, 28);
    centralHeader.writeUInt32LE(localOffset, 42);
    centralRecords.push(Buffer.concat([centralHeader, nameBytes]));

    localOffset += localRecord.byteLength;
  }

  const localData = Buffer.concat(localRecords);
  const centralDirectory = Buffer.concat(centralRecords);
  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0);
  endRecord.writeUInt16LE(centralRecords.length, 8);
  endRecord.writeUInt16LE(centralRecords.length, 10);
  endRecord.writeUInt32LE(centralDirectory.byteLength, 12);
  endRecord.writeUInt32LE(localData.byteLength, 16);

  return Buffer.concat([localData, centralDirectory, endRecord]);
}

export function createStoredZip(entries: Record<string, string | Uint8Array>): Buffer {
  return createZip(entries, 0);
}

export function createDocxBytes(options: { deflated?: boolean } = {}): Buffer {
  return createZip({
    '[Content_Types].xml':
      `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="${WORD_MAIN_CONTENT_TYPE}"/></Types>`,
    'word/document.xml':
      '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body/></w:document>',
  }, options.deflated ? 8 : 0);
}

export function createSpreadsheetZipBytes(options: { includeFakeWordEntry?: boolean } = {}): Buffer {
  return createStoredZip({
    '[Content_Types].xml':
      `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/xl/workbook.xml" ContentType="${SPREADSHEET_MAIN_CONTENT_TYPE}"/></Types>`,
    'xl/workbook.xml':
      '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"/>',
    ...(options.includeFakeWordEntry
      ? { 'word/document.xml': '<w:document />' }
      : {}),
  });
}

export function withDeclaredZipEntrySize(
  input: Uint8Array,
  entryName: string,
  declaredSize: number
): Buffer {
  const bytes = Buffer.from(input);
  const nameBytes = Buffer.from(entryName, 'utf8');

  for (let offset = 0; offset + 46 + nameBytes.byteLength <= bytes.byteLength; offset += 1) {
    if (bytes.readUInt32LE(offset) !== 0x02014b50) continue;
    const nameLength = bytes.readUInt16LE(offset + 28);
    if (nameLength !== nameBytes.byteLength) continue;
    if (!bytes.subarray(offset + 46, offset + 46 + nameLength).equals(nameBytes)) continue;

    const localHeaderOffset = bytes.readUInt32LE(offset + 42);
    bytes.writeUInt32LE(declaredSize >>> 0, offset + 24);
    bytes.writeUInt32LE(declaredSize >>> 0, localHeaderOffset + 22);
    return bytes;
  }

  throw new Error(`ZIP fixture entry was not found: ${entryName}`);
}

export function createLegacyDocBytes(streamName = 'WordDocument'): Buffer {
  const sectorSize = 512;
  const directorySectorId = 0;
  const fatSectorId = 1;
  const bytes = Buffer.alloc(sectorSize * 3);
  Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]).copy(bytes, 0);
  bytes.writeUInt16LE(3, 26);
  bytes.writeUInt16LE(0xfffe, 28);
  bytes.writeUInt16LE(9, 30);
  bytes.writeUInt16LE(6, 32);
  bytes.writeUInt32LE(1, 44);
  bytes.writeUInt32LE(directorySectorId, 48);
  bytes.writeUInt32LE(4096, 56);
  bytes.writeUInt32LE(0xfffffffe, 60);
  bytes.writeUInt32LE(0, 64);
  bytes.writeUInt32LE(0xfffffffe, 68);
  bytes.writeUInt32LE(0, 72);
  for (let index = 0; index < 109; index += 1) {
    bytes.writeUInt32LE(index === 0 ? fatSectorId : 0xffffffff, 76 + index * 4);
  }

  const writeDirectoryEntry = (offset: number, name: string, objectType: number) => {
    const directoryName = Buffer.from(`${name}\0`, 'utf16le');
    directoryName.copy(bytes, offset, 0, Math.min(directoryName.byteLength, 64));
    bytes.writeUInt16LE(Math.min(directoryName.byteLength, 64), offset + 64);
    bytes[offset + 66] = objectType;
    bytes.writeUInt32LE(0xffffffff, offset + 68);
    bytes.writeUInt32LE(0xffffffff, offset + 72);
    bytes.writeUInt32LE(0xffffffff, offset + 76);
    bytes.writeUInt32LE(0xfffffffe, offset + 116);
  };

  writeDirectoryEntry(sectorSize, 'Root Entry', 5);
  writeDirectoryEntry(sectorSize + 128, streamName, 2);

  const fatOffset = sectorSize * (fatSectorId + 1);
  for (let offset = 0; offset < sectorSize; offset += 4) {
    bytes.writeUInt32LE(0xffffffff, fatOffset + offset);
  }
  bytes.writeUInt32LE(0xfffffffe, fatOffset + directorySectorId * 4);
  bytes.writeUInt32LE(0xfffffffd, fatOffset + fatSectorId * 4);
  return bytes;
}
import { deflateRawSync } from 'node:zlib';
