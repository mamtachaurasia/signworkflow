import { Doc } from '@/types/types';

const isFile = (value: unknown): value is File => {
  return typeof File !== 'undefined' && value instanceof File;
};

const appendGuestId = (url: string, guestId?: string | null) => {
  if (!guestId || url.includes('guestId=')) {
    return url;
  }

  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}guestId=${guestId}`;
};

export const resolvePdfSource = (
  value: File | string | Doc | null,
  guestId?: string | null
): File | string | null => {
  if (!value) {
    return null;
  }

  if (typeof value === 'string' || isFile(value)) {
    return value;
  }

  const fileCandidate = value.file;
  if (typeof fileCandidate === 'string' || isFile(fileCandidate)) {
    return fileCandidate;
  }

  if (typeof value.fileUrl === 'string') {
    return appendGuestId(value.fileUrl, guestId);
  }

  if (typeof value.url === 'string') {
    return appendGuestId(value.url, guestId);
  }

  return null;
};
