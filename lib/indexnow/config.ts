import { SITE_URL } from '@/lib/site';

const DEFAULT_INDEXNOW_KEY = 'b3f1a7e8d9c123456789abcdef';
const key = process.env.INDEXNOW_KEY?.trim() || DEFAULT_INDEXNOW_KEY;
const host = SITE_URL;

export const indexNowConfig = {
  host,
  key,
  keyLocation: new URL(`/${key}.txt`, host).toString(),
  endpoint: process.env.INDEXNOW_ENDPOINT?.trim() || 'https://api.indexnow.org/indexnow',
};
