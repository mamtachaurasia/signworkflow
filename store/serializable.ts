import { isPlain } from '@reduxjs/toolkit';

// Large document and template payloads are expected in this app, so we keep
// Redux Toolkit's dev checks enabled but give them a little more headroom
// before warning in the console.
export const REDUX_DEV_CHECK_WARN_AFTER_MS = 128;

export function isAllowedNonSerializable(value: unknown): boolean {
  if (value instanceof Date) {
    return true;
  }

  if (typeof File !== 'undefined' && value instanceof File) {
    return true;
  }

  if (typeof Blob !== 'undefined' && value instanceof Blob) {
    return true;
  }

  return false;
}

export function isSerializableReduxValue(value: unknown): boolean {
  return isPlain(value) || isAllowedNonSerializable(value);
}
