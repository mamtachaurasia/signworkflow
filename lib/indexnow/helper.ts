import { submitUrls } from "./service";

let queue: string[] = [];

export function addToQueue(url: string) {
  queue.push(url);
  if (queue.length >= 10) {
    void flushQueue().catch((error: unknown) => {
      console.error(
        'IndexNow queue flush failed:',
        error instanceof Error ? error.message : String(error)
      );
    });
  }
}

export async function flushQueue() {
  if (!queue.length) return;
  const urls = [...queue];
  queue = [];
  try {
    await submitUrls(urls);
  } catch (error) {
    queue = [...urls, ...queue];
    throw error;
  }
}
