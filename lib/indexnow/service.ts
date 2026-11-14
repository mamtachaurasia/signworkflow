import { indexNowConfig } from "./config";
import { IndexNowPayload } from "./types";

export async function submitUrls(urls: string[]): Promise<void> {
  if (!urls.length) return;

  const payload: IndexNowPayload = {
    host: new URL(indexNowConfig.host).hostname,
    key: indexNowConfig.key,
    keyLocation: indexNowConfig.keyLocation,
    urlList: urls,
  };

  const res = await fetch(indexNowConfig.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`IndexNow returned HTTP ${res.status}`);
  }
}
